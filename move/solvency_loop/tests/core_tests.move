#[test_only]
module solvency_loop::core_tests {
    use std::string;
    use memwal::account::{Self, MemWalAccount};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};
    use solvency_loop::core::{Self, SolvencyRegistry, UserProfile, GroupSplitEscrow, CooldownVault};
    use 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC;

    fun setup(): (Scenario, Clock) {
        let mut s = test_scenario::begin(@0xA);
        core::init_for_testing(s.ctx());
        let c = clock::create_for_testing(s.ctx());
        let owners = vector[@0xA, @0xB, @0xC, @0xD];
        let mut i = 0;
        while (i < owners.length()) {
            let memory = account::test_account_for_owner(owners[i], s.ctx());
            transfer::public_transfer(memory, owners[i]); i = i + 1;
        };
        i = 0;
        while (i < owners.length()) { s.next_tx(owners[i]); register(&mut s, &c); i = i + 1; };
        s.next_tx(@0xA); (s, c)
    }
    fun finish(s: Scenario, c: Clock) { clock::destroy_for_testing(c); s.end(); }
    fun register(s: &mut Scenario, c: &Clock) {
        let m = s.take_from_sender<MemWalAccount>();
        if (s.has_most_recent_for_sender<UserProfile>()) {
            let mut p = s.take_from_sender<UserProfile>();
            core::update_profile(&mut p, string::utf8(b"owner"), &m, 300, s.ctx());
            s.return_to_sender(p);
        } else {
            let mut r = s.take_shared<SolvencyRegistry>();
            core::register_user(&mut r, string::utf8(b"owner"), &m, 300, vector[], vector[], c, s.ctx());
            test_scenario::return_shared(r);
        };
        s.return_to_sender(m);
    }
    // An unregistered test caller is deliberately handed someone else's profile
    // to verify the contract guard as well as Sui's object ownership boundary.
    fun take_profile(s: &Scenario): UserProfile {
        if (s.has_most_recent_for_sender<UserProfile>()) s.take_from_sender<UserProfile>()
        else s.take_from_address<UserProfile>(@0xA)
    }
    fun return_profile(p: UserProfile) {
        let (owner, _, _, _) = core::profile_for_testing(&p);
        test_scenario::return_to_address(owner, p);
    }
    fun create_with<T>(s: &mut Scenario, c: &Clock, debtors: vector<address>, amounts: vector<u64>, flags: vector<bool>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::create_group_split<T>(&p, &m, string::utf8(b"Dinner"), 40, debtors, amounts, flags, c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun create(s: &mut Scenario, c: &Clock, upfront: bool) {
        create_with<USDC>(s, c, vector[@0xB, @0xC, @0xD], vector[10, 10, 10], vector[false, false, upfront]);
    }
    fun settle(s: &mut Scenario, c: &Clock, split: &mut GroupSplitEscrow<USDC>, amount: u64) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::settle_split_share(&p, &m, split, coin::mint_for_testing(amount, s.ctx()), c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun fund(s: &mut Scenario, c: &Clock, split: &mut GroupSplitEscrow<USDC>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::fund_split_share(&p, &m, split, coin::mint_for_testing(10, s.ctx()), c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun activate(s: &mut Scenario, c: &Clock, split: &mut GroupSplitEscrow<USDC>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::activate_group_split(&p, &m, split, c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun cancel(s: &mut Scenario, split: &mut GroupSplitEscrow<USDC>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::cancel_group_split(&p, &m, split, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun refund(s: &mut Scenario, c: &Clock, split: &mut GroupSplitEscrow<USDC>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::refund_escrow(&p, &m, split, c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun lock(s: &mut Scenario, c: &Clock, reserve: u64) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::lock_in_cooldown_vault<USDC>(&p, &m, coin::mint_for_testing(10, s.ctx()), coin::mint_for_testing(reserve, s.ctx()), string::utf8(b"habit_regret"), c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun unlock(s: &mut Scenario, c: &Clock, vault: CooldownVault<USDC>) {
        let p = take_profile(s); let m = s.take_from_sender<MemWalAccount>();
        core::unlock_cooldown_vault(&p, &m, vault, c, s.ctx());
        s.return_to_sender(m); return_profile(p);
    }
    fun add_unregistered_wallet(s: &mut Scenario) {
        let m = account::test_account_for_owner(@0xE, s.ctx()); transfer::public_transfer(m, @0xE); s.next_tx(@0xE);
    }

    #[test]
    fun profile_updates_without_registry_write_or_duplicate_user() {
        let (mut s, c) = setup();
        let mut p = s.take_from_sender<UserProfile>(); let m = s.take_from_sender<MemWalAccount>();
        let id = object::id(&p);
        core::update_profile(&mut p, string::utf8(b"renamed"), &m, 200, s.ctx());
        core::add_contact(&mut p, &m, @0xB, string::utf8(b"friend"), s.ctx());
        let (owner, handle, floor, contacts) = core::profile_for_testing(&p);
        assert!(owner == @0xA && handle == string::utf8(b"renamed") && floor == 200 && contacts == 1);
        core::remove_contact(&mut p, &m, @0xB, s.ctx());
        let (_, _, _, contacts) = core::profile_for_testing(&p); assert!(contacts == 0);
        // The registry is only borrowed here to inspect the directory after edits.
        let r = s.take_shared<SolvencyRegistry>();
        assert!(core::users_for_testing(&r) == 4 && core::profile_id_for_testing(&r, @0xA) == id);
        let other = s.take_from_address<UserProfile>(@0xB);
        assert!(object::id(&other) != id);
        let (_, other_handle, other_floor, _) = core::profile_for_testing(&other);
        assert!(other_handle == string::utf8(b"owner") && other_floor == 300);
        test_scenario::return_to_address(@0xB, other);
        s.return_to_sender(p); s.return_to_sender(m); test_scenario::return_shared(r);
        finish(s, c);
    }

    #[test]
    fun factory_creates_owned_profile_with_contacts_and_directory_id() {
        let (mut s, c) = setup(); add_unregistered_wallet(&mut s);
        let mut r = s.take_shared<SolvencyRegistry>(); let m = s.take_from_sender<MemWalAccount>();
        core::register_user(&mut r, string::utf8(b"new owner"), &m, 123, vector[@0xB], vector[string::utf8(b"friend")], &c, s.ctx());
        let id = core::profile_id_for_testing(&r, @0xE); assert!(core::users_for_testing(&r) == 5);
        s.return_to_sender(m); test_scenario::return_shared(r); s.next_tx(@0xE);
        let p = s.take_from_sender<UserProfile>();
        let (owner, _, floor, contacts) = core::profile_for_testing(&p);
        assert!(object::id(&p) == id && owner == @0xE && floor == 123 && contacts == 1);
        s.return_to_sender(p); finish(s, c);
    }

    #[test, expected_failure(abort_code = 113, location = solvency_loop::core)]
    fun duplicate_registration_rejected() {
        let (mut s, c) = setup(); let mut r = s.take_shared<SolvencyRegistry>(); let m = s.take_from_sender<MemWalAccount>();
        core::register_user(&mut r, string::utf8(b"duplicate"), &m, 300, vector[], vector[], &c, s.ctx());
        s.return_to_sender(m); test_scenario::return_shared(r); finish(s, c);
    }

    #[test, expected_failure(abort_code = 106, location = solvency_loop::core)]
    fun factory_rejects_duplicate_contacts() {
        let (mut s, c) = setup(); add_unregistered_wallet(&mut s);
        let mut r = s.take_shared<SolvencyRegistry>(); let m = s.take_from_sender<MemWalAccount>();
        core::register_user(&mut r, string::utf8(b"new"), &m, 300, vector[@0xB, @0xB], vector[string::utf8(b"b"), string::utf8(b"b")], &c, s.ctx());
        s.return_to_sender(m); test_scenario::return_shared(r); finish(s, c);
    }

    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun foreign_profile_cannot_be_edited() {
        let (mut s, c) = setup(); s.next_tx(@0xB);
        let mut p = s.take_from_address<UserProfile>(@0xA); let m = s.take_from_sender<MemWalAccount>();
        core::update_profile(&mut p, string::utf8(b"stolen"), &m, 0, s.ctx());
        test_scenario::return_to_address(@0xA, p); s.return_to_sender(m); finish(s, c);
    }

    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun foreign_profile_cannot_authorize_payment() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let p = s.take_from_address<UserProfile>(@0xA); let m = s.take_from_sender<MemWalAccount>(); let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&p, &m, &mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        test_scenario::return_to_address(@0xA, p); s.return_to_sender(m); test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 112, location = solvency_loop::core)]
    fun frozen_account_cannot_edit_contacts() {
        let (mut s, c) = setup(); let mut m = s.take_from_sender<MemWalAccount>(); let mut p = s.take_from_sender<UserProfile>();
        account::test_set_active(&mut m, false);
        core::add_contact(&mut p, &m, @0xB, string::utf8(b"friend"), s.ctx());
        s.return_to_sender(m); s.return_to_sender(p); finish(s, c);
    }

    #[test]
    fun exact_standard_settlement() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        settle(&mut s, &c, &mut split, 10);
        assert!(core::settled_for_testing(&split, @0xB));
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let payment = s.take_from_sender<Coin<USDC>>(); assert!(payment.value() == 10); coin::burn_for_testing(payment);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 104, location = solvency_loop::core)]
    fun double_payment_rejected() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        settle(&mut s, &c, &mut split, 10);
        test_scenario::return_shared(split); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        settle(&mut s, &c, &mut split, 10);
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 103, location = solvency_loop::core)]
    fun overpayment_rejected() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        settle(&mut s, &c, &mut split, 11);
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 107, location = solvency_loop::core)]
    fun settlement_blocked_until_upfront_funding() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        settle(&mut s, &c, &mut split, 10);
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 108, location = solvency_loop::core)]
    fun cannot_activate_unfunded_split() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        activate(&mut s, &c, &mut split);
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test]
    fun escrow_is_held_until_creator_activation() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        fund(&mut s, &c, &mut split);
        let (active, pending, balance) = core::state_for_testing(&split); assert!(!active && pending == 0 && balance == 10);
        assert!(!core::settled_for_testing(&split, @0xD));
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        activate(&mut s, &c, &mut split);
        let (active, pending, balance) = core::state_for_testing(&split); assert!(active && pending == 0 && balance == 0);
        assert!(core::settled_for_testing(&split, @0xD));
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let payment = s.take_from_sender<Coin<USDC>>(); assert!(payment.value() == 10); coin::burn_for_testing(payment);
        finish(s, c);
    }

    #[test]
    fun cancellation_allows_refund() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        fund(&mut s, &c, &mut split);
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        cancel(&mut s, &mut split);
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        refund(&mut s, &c, &mut split);
        let (active, pending, balance) = core::state_for_testing(&split); assert!(!active && pending == 1 && balance == 0);
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let refund = s.take_from_sender<Coin<USDC>>(); assert!(refund.value() == 10); coin::burn_for_testing(refund);
        finish(s, c);
    }

    #[test]
    fun expired_funding_allows_refund_without_creator() {
        let (mut s, mut c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        fund(&mut s, &c, &mut split);
        clock::set_for_testing(&mut c, 86_400_001);
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        refund(&mut s, &c, &mut split);
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let refund = s.take_from_sender<Coin<USDC>>(); assert!(refund.value() == 10); coin::burn_for_testing(refund);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun only_creator_can_cancel() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        cancel(&mut s, &mut split);
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 106, location = solvency_loop::core)]
    fun duplicate_debtors_rejected() {
        let (mut s, c) = setup();
        create_with<USDC>(&mut s, &c, vector[@0xB, @0xB], vector[10, 10], vector[false, false]);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 110, location = solvency_loop::core)]
    fun non_circle_coin_rejected() {
        let (mut s, c) = setup();
        create_with<SUI>(&mut s, &c, vector[@0xB], vector[10], vector[false]);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 109, location = solvency_loop::core)]
    fun liquidity_floor_enforced_atomically() {
        let (mut s, c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        lock(&mut s, &c, 299); finish(s, c);
    }

    #[test, expected_failure(abort_code = 101, location = solvency_loop::core)]
    fun cannot_unlock_before_24_hours() {
        let (mut s, c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        lock(&mut s, &c, 300); s.next_tx(@0xA);
        let reserve_back = s.take_from_sender<Coin<USDC>>(); assert!(reserve_back.value() == 300); coin::burn_for_testing(reserve_back);
        let vault = s.take_from_sender<CooldownVault<USDC>>();
        unlock(&mut s, &c, vault); finish(s, c);
    }

    #[test]
    fun owner_unlocks_after_exactly_24_hours() {
        let (mut s, mut c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        lock(&mut s, &c, 300); s.next_tx(@0xA);
        let vault = s.take_from_sender<CooldownVault<USDC>>();
        clock::set_for_testing(&mut c, 86_400_000);
        unlock(&mut s, &c, vault); s.next_tx(@0xA);
        let returned = s.take_from_sender<Coin<USDC>>(); assert!(returned.value() == 10); coin::burn_for_testing(returned);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun unregistered_wallet_cannot_create_split() { let (mut s, c) = setup(); add_unregistered_wallet(&mut s); create(&mut s, &c, false); finish(s, c); }
    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun unregistered_wallet_cannot_settle() {
        let (mut s, c) = setup(); create_with<USDC>(&mut s, &c, vector[@0xE], vector[10], vector[false]); add_unregistered_wallet(&mut s);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>(); settle(&mut s, &c, &mut split, 10); test_scenario::return_shared(split); finish(s, c);
    }
    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun unregistered_wallet_cannot_fund() {
        let (mut s, c) = setup(); create_with<USDC>(&mut s, &c, vector[@0xE], vector[10], vector[true]); add_unregistered_wallet(&mut s);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>(); fund(&mut s, &c, &mut split); test_scenario::return_shared(split); finish(s, c);
    }
    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun unregistered_wallet_cannot_lock() { let (mut s, c) = setup(); add_unregistered_wallet(&mut s); lock(&mut s, &c, 300); finish(s, c); }
    #[test, expected_failure(abort_code = 112, location = solvency_loop::core)]
    fun foreign_memwal_account_cannot_register() {
        let (mut s, c) = setup(); let mut r = s.take_shared<SolvencyRegistry>(); let m = account::test_account_for_owner(@0xB, s.ctx());
        core::register_user(&mut r, string::utf8(b"bad"), &m, 300, vector[], vector[], &c, s.ctx()); transfer::public_transfer(m, @0xB); test_scenario::return_shared(r); finish(s, c);
    }
    #[test, expected_failure(abort_code = 112, location = solvency_loop::core)]
    fun foreign_memwal_account_cannot_settle() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let p = take_profile(&s); let m = account::test_account_for_owner(@0xA, s.ctx()); let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&p, &m, &mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx()); transfer::public_transfer(m, @0xA); return_profile(p); test_scenario::return_shared(split); finish(s, c);
    }
    #[test, expected_failure(abort_code = 112, location = solvency_loop::core)]
    fun mismatched_profile_account_cannot_spend() {
        let (mut s, c) = setup(); let p = take_profile(&s); let m = account::test_account_for_owner(@0xA, s.ctx());
        core::create_group_split<USDC>(&p, &m, string::utf8(b"bad"), 40, vector[@0xB], vector[10], vector[false], &c, s.ctx()); transfer::public_transfer(m, @0xA); return_profile(p); finish(s, c);
    }
    #[test, expected_failure(abort_code = 112, location = solvency_loop::core)]
    fun frozen_account_cannot_create_new_commitment() {
        let (mut s, c) = setup(); let mut m = s.take_from_sender<MemWalAccount>(); account::test_set_active(&mut m, false); s.return_to_sender(m); s.next_tx(@0xA); create(&mut s, &c, false); finish(s, c);
    }
    #[test]
    fun frozen_account_can_recover_existing_escrow() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>(); fund(&mut s, &c, &mut split); test_scenario::return_shared(split); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>(); cancel(&mut s, &mut split); test_scenario::return_shared(split); s.next_tx(@0xD);
        let mut m = s.take_from_sender<MemWalAccount>(); account::test_set_active(&mut m, false); s.return_to_sender(m);
        s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>(); refund(&mut s, &c, &mut split); test_scenario::return_shared(split); s.next_tx(@0xD);
        let payment = s.take_from_sender<Coin<USDC>>(); assert!(payment.value() == 10); coin::burn_for_testing(payment); finish(s, c);
    }
    #[test]
    fun frozen_account_can_unlock_matured_vault() {
        let (mut s, mut c) = setup(); lock(&mut s, &c, 300); s.next_tx(@0xA);
        let reserve = s.take_from_sender<Coin<USDC>>(); coin::burn_for_testing(reserve);
        let mut m = s.take_from_sender<MemWalAccount>(); account::test_set_active(&mut m, false); s.return_to_sender(m);
        s.next_tx(@0xA);
        let vault = s.take_from_sender<CooldownVault<USDC>>(); clock::set_for_testing(&mut c, 86_400_000); unlock(&mut s, &c, vault); s.next_tx(@0xA);
        let payment = s.take_from_sender<Coin<USDC>>(); assert!(payment.value() == 10); coin::burn_for_testing(payment); finish(s, c);
    }
}
