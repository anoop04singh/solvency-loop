#[test_only]
module solvency_loop::core_tests {
    use std::string;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};
    use solvency_loop::core::{Self, SolvencyRegistry, GroupSplitEscrow, CooldownVault};
    use circle_usdc::usdc::USDC;

    fun setup(): (Scenario, Clock) {
        let mut s = test_scenario::begin(@0xA);
        core::init_for_testing(s.ctx());
        let clock = clock::create_for_testing(s.ctx());
        s.next_tx(@0xA);
        (s, clock)
    }
    fun finish(s: Scenario, c: Clock) { clock::destroy_for_testing(c); s.end(); }
    fun create(s: &mut Scenario, c: &Clock, upfront: bool) {
        core::create_group_split<USDC>(string::utf8(b"Dinner"), 40, vector[@0xB, @0xC, @0xD],
            vector[10, 10, 10], vector[false, false, upfront], c, s.ctx());
    }
    fun register(s: &mut Scenario, c: &Clock) {
        let mut r = s.take_shared<SolvencyRegistry>();
        core::register_user(&mut r, string::utf8(b"owner"), @0x123, 300, c, s.ctx());
        test_scenario::return_shared(r);
    }

    #[test]
    fun profile_updates_without_duplicate_user() {
        let (mut s, c) = setup();
        register(&mut s, &c);
        s.next_tx(@0xA);
        let mut r = s.take_shared<SolvencyRegistry>();
        core::register_user(&mut r, string::utf8(b"renamed"), @0x123, 200, &c, s.ctx());
        core::add_contact(&mut r, @0xB, string::utf8(b"friend"), s.ctx());
        core::remove_contact(&mut r, @0xB, s.ctx());
        assert!(core::users_for_testing(&r) == 1);
        test_scenario::return_shared(r);
        finish(s, c);
    }

    #[test]
    fun exact_standard_settlement() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        assert!(core::settled_for_testing(&split, @0xB));
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let payment = s.take_from_sender<Coin<USDC>>(); assert!(payment.value() == 10); coin::burn_for_testing(payment);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 104, location = solvency_loop::core)]
    fun double_payment_rejected() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        core::settle_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 103, location = solvency_loop::core)]
    fun overpayment_rejected() {
        let (mut s, c) = setup(); create(&mut s, &c, false); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&mut split, coin::mint_for_testing(11, s.ctx()), &c, s.ctx());
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 107, location = solvency_loop::core)]
    fun settlement_blocked_until_upfront_funding() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::settle_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 108, location = solvency_loop::core)]
    fun cannot_activate_unfunded_split() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::activate_group_split(&mut split, &c, s.ctx());
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test]
    fun escrow_is_held_until_creator_activation() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::fund_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        let (active, pending, balance) = core::state_for_testing(&split); assert!(!active && pending == 0 && balance == 10);
        assert!(!core::settled_for_testing(&split, @0xD));
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::activate_group_split(&mut split, &c, s.ctx());
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
        core::fund_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        test_scenario::return_shared(split); s.next_tx(@0xA);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::cancel_group_split(&mut split, s.ctx());
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::refund_escrow(&mut split, &c, s.ctx());
        let (active, pending, balance) = core::state_for_testing(&split); assert!(!active && pending == 1 && balance == 0);
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let refund = s.take_from_sender<Coin<USDC>>(); assert!(refund.value() == 10); coin::burn_for_testing(refund);
        finish(s, c);
    }

    #[test]
    fun expired_funding_allows_refund_without_creator() {
        let (mut s, mut c) = setup(); create(&mut s, &c, true); s.next_tx(@0xD);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::fund_split_share(&mut split, coin::mint_for_testing(10, s.ctx()), &c, s.ctx());
        clock::set_for_testing(&mut c, 86_400_001);
        core::refund_escrow(&mut split, &c, s.ctx());
        test_scenario::return_shared(split); s.next_tx(@0xD);
        let refund = s.take_from_sender<Coin<USDC>>(); assert!(refund.value() == 10); coin::burn_for_testing(refund);
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 102, location = solvency_loop::core)]
    fun only_creator_can_cancel() {
        let (mut s, c) = setup(); create(&mut s, &c, true); s.next_tx(@0xB);
        let mut split = s.take_shared<GroupSplitEscrow<USDC>>();
        core::cancel_group_split(&mut split, s.ctx());
        test_scenario::return_shared(split); finish(s, c);
    }

    #[test, expected_failure(abort_code = 106, location = solvency_loop::core)]
    fun duplicate_debtors_rejected() {
        let (mut s, c) = setup();
        core::create_group_split<USDC>(string::utf8(b"Bad"), 40, vector[@0xB, @0xB], vector[10, 10], vector[false, false], &c, s.ctx());
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 110, location = solvency_loop::core)]
    fun non_circle_coin_rejected() {
        let (mut s, c) = setup();
        core::create_group_split<SUI>(string::utf8(b"Bad"), 40, vector[@0xB], vector[10], vector[false], &c, s.ctx());
        finish(s, c);
    }

    #[test, expected_failure(abort_code = 109, location = solvency_loop::core)]
    fun liquidity_floor_enforced_atomically() {
        let (mut s, c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        let r = s.take_shared<SolvencyRegistry>(); let reserve = coin::mint_for_testing<USDC>(299, s.ctx());
        core::lock_in_cooldown_vault(&r, coin::mint_for_testing(10, s.ctx()), reserve, string::utf8(b"habit_regret"), &c, s.ctx());
        test_scenario::return_shared(r); finish(s, c);
    }

    #[test, expected_failure(abort_code = 101, location = solvency_loop::core)]
    fun cannot_unlock_before_24_hours() {
        let (mut s, c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        let r = s.take_shared<SolvencyRegistry>(); let reserve = coin::mint_for_testing<USDC>(300, s.ctx());
        core::lock_in_cooldown_vault(&r, coin::mint_for_testing(10, s.ctx()), reserve, string::utf8(b"habit_regret"), &c, s.ctx());
        test_scenario::return_shared(r); s.next_tx(@0xA);
        let reserve_back = s.take_from_sender<Coin<USDC>>(); assert!(reserve_back.value() == 300); coin::burn_for_testing(reserve_back);
        let vault = s.take_from_sender<CooldownVault<USDC>>();
        core::unlock_cooldown_vault(vault, &c, s.ctx()); finish(s, c);
    }

    #[test]
    fun owner_unlocks_after_exactly_24_hours() {
        let (mut s, mut c) = setup(); register(&mut s, &c); s.next_tx(@0xA);
        let r = s.take_shared<SolvencyRegistry>(); let reserve = coin::mint_for_testing<USDC>(300, s.ctx());
        core::lock_in_cooldown_vault(&r, coin::mint_for_testing(10, s.ctx()), reserve, string::utf8(b"habit_regret"), &c, s.ctx());
        test_scenario::return_shared(r); s.next_tx(@0xA);
        let vault = s.take_from_sender<CooldownVault<USDC>>();
        clock::set_for_testing(&mut c, 86_400_000);
        core::unlock_cooldown_vault(vault, &c, s.ctx()); s.next_tx(@0xA);
        let returned = s.take_from_sender<Coin<USDC>>(); assert!(returned.value() == 10); coin::burn_for_testing(returned);
        finish(s, c);
    }
}
