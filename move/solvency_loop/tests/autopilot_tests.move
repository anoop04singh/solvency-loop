#[test_only]
module solvency_loop::autopilot_tests {
    use std::string;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario};
    use memwal::account::{Self, MemWalAccount};
    use solvency_loop::core::{Self, UserProfile, SolvencyRegistry, GroupSplitEscrow};
    use solvency_loop::autopilot::{Self, AgentDirectory, AgentAllowanceVault, GroupConvention};
    use 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC;
    const DAY: u64 = 86400000;
    fun bytes(n: u8): vector<u8> { let mut v = vector[]; while (v.length() < 32) { v.push_back(n); }; v }
    fun setup(): (Scenario, Clock, ID, ID) {
        let mut s = test_scenario::begin(@0xA); core::init_for_testing(s.ctx()); autopilot::create_agent_directory(s.ctx());
        let c = clock::create_for_testing(s.ctx());
        let mut a = account::test_account_for_owner(@0xA, s.ctx()); account::test_authorize_derived_delegate(&mut a, bytes(1)); let a_id = object::id(&a); transfer::public_share_object(a);
        let mut b = account::test_account_for_owner(@0xB, s.ctx()); account::test_authorize_derived_delegate(&mut b, bytes(1)); let b_id = object::id(&b); transfer::public_share_object(b);
        s.next_tx(@0xA); let m = s.take_shared_by_id<MemWalAccount>(a_id); let mut r = s.take_shared<SolvencyRegistry>();
        core::register_user(&mut r, string::utf8(b"A"), &m, 10, vector[@0xB], vector[string::utf8(b"B")], &c, s.ctx()); test_scenario::return_shared(m); test_scenario::return_shared(r);
        s.next_tx(@0xB); let m = s.take_shared_by_id<MemWalAccount>(b_id); let mut r = s.take_shared<SolvencyRegistry>();
        core::register_user(&mut r, string::utf8(b"B"), &m, 10, vector[@0xA], vector[string::utf8(b"A")], &c, s.ctx()); test_scenario::return_shared(m); test_scenario::return_shared(r);
        s.next_tx(@0xA); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(a_id); let mut d = s.take_shared<AgentDirectory>();
        autopilot::create_agent_allowance_vault(&p, &m, &mut d, coin::mint_for_testing<USDC>(100, s.ctx()), coin::mint_for_testing<USDC>(10, s.ctx()), @0xE, account::derive_sui_address(&bytes(1)), 25, 40, DAY * 30, true, true, true, vector[@0xB], &c, s.ctx());
        s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(d); s.next_tx(@0xE); (s, c, a_id, b_id)
    }
    fun bill(s: &mut Scenario, c: &Clock, amount: u64, upfront: bool): ID { core::create_split_for<USDC>(@0xB, string::utf8(b"real fixture bill"), amount + 1, vector[@0xA], vector[amount], vector[upfront], c, s.ctx()) }
    fun finish(s: Scenario, c: Clock) { clock::destroy_for_testing(c); s.end(); }
    fun pay(s: &mut Scenario, c: &Clock, memory: ID, split: ID, n: u8, epoch: u64) {
        let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); let m = s.take_shared_by_id<MemWalAccount>(memory); let mut b = s.take_shared_by_id<GroupSplitEscrow<USDC>>(split);
        autopilot::settle_share_by_agent(&mut v, &m, epoch, &mut b, bytes(n), c, s.ctx()); test_scenario::return_shared(v); test_scenario::return_shared(m); test_scenario::return_shared(b);
    }
    #[test]
    fun exact_delegated_payment_and_owner_recovery() {
        let (mut s, c, memory, _) = setup(); let id = bill(&mut s, &c, 20, false); s.next_tx(@0xE); pay(&mut s, &c, memory, id, 1, 0);
        s.next_tx(@0xA); let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); let (remaining, spent, active) = autopilot::vault_state(&v); assert!(remaining == 80 && spent == 20 && active);
        let mut m = s.take_shared_by_id<MemWalAccount>(memory); account::test_set_active(&mut m, false); test_scenario::return_shared(m);
        autopilot::revoke_agent_vault(&mut v, s.ctx()); autopilot::withdraw_from_agent_vault(&mut v, 80, s.ctx()); test_scenario::return_shared(v); finish(s, c);
    }
    #[test, expected_failure(abort_code = 201, location = solvency_loop::autopilot)]
    fun wrong_executor_rejected() { let (mut s, c, m, _) = setup(); let id = bill(&mut s, &c, 20, false); s.next_tx(@0xF); pay(&mut s, &c, m, id, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 206, location = solvency_loop::autopilot)]
    fun foreign_memory_rejected() { let (mut s, c, _, foreign) = setup(); let id = bill(&mut s, &c, 20, false); s.next_tx(@0xE); pay(&mut s, &c, foreign, id, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 203, location = solvency_loop::autopilot)]
    fun per_transaction_limit_rejected() { let (mut s, c, m, _) = setup(); let id = bill(&mut s, &c, 26, false); s.next_tx(@0xE); pay(&mut s, &c, m, id, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 203, location = solvency_loop::autopilot)]
    fun composing_payments_cannot_bypass_per_transaction_cap() {
        let (mut s, c, memory, _) = setup(); let id1 = bill(&mut s, &c, 20, false); let id2 = bill(&mut s, &c, 20, false); s.next_tx(@0xE);
        let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); let m = s.take_shared_by_id<MemWalAccount>(memory); let mut b1 = s.take_shared_by_id<GroupSplitEscrow<USDC>>(id1); let mut b2 = s.take_shared_by_id<GroupSplitEscrow<USDC>>(id2);
        autopilot::settle_share_by_agent(&mut v, &m, 0, &mut b1, bytes(1), &c, s.ctx()); autopilot::settle_share_by_agent(&mut v, &m, 0, &mut b2, bytes(2), &c, s.ctx());
        test_scenario::return_shared(v); test_scenario::return_shared(m); test_scenario::return_shared(b1); test_scenario::return_shared(b2); finish(s, c);
    }
    #[test, expected_failure(abort_code = 204, location = solvency_loop::autopilot)]
    fun true_rolling_window_retains_recent_spend_after_first_expiry() {
        let (mut s, mut c, m, _) = setup(); let a = bill(&mut s, &c, 20, false); let b = bill(&mut s, &c, 20, false); let d = bill(&mut s, &c, 25, false);
        s.next_tx(@0xE); pay(&mut s, &c, m, a, 1, 0); clock::increment_for_testing(&mut c, DAY - 1);
        s.next_tx(@0xE); pay(&mut s, &c, m, b, 2, 0); clock::increment_for_testing(&mut c, 1);
        s.next_tx(@0xE); pay(&mut s, &c, m, d, 3, 0); finish(s, c);
    }
    #[test, expected_failure(abort_code = 207, location = solvency_loop::autopilot)]
    fun replay_nonce_rejected_before_a_second_bill_can_be_paid() { let (mut s, c, m, _) = setup(); let a = bill(&mut s, &c, 10, false); let b = bill(&mut s, &c, 10, false); s.next_tx(@0xE); pay(&mut s, &c, m, a, 1, 0); s.next_tx(@0xE); pay(&mut s, &c, m, b, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 205, location = solvency_loop::autopilot)]
    fun revoked_epoch_cannot_execute() { let (mut s, c, m, _) = setup(); let id = bill(&mut s, &c, 10, false); s.next_tx(@0xA); let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); autopilot::revoke_agent_vault(&mut v, s.ctx()); test_scenario::return_shared(v); s.next_tx(@0xE); pay(&mut s, &c, m, id, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 206, location = solvency_loop::autopilot)]
    fun frozen_memory_stops_agent_payments() { let (mut s, c, memory, _) = setup(); let id = bill(&mut s, &c, 10, false); let mut m = s.take_shared_by_id<MemWalAccount>(memory); account::test_set_active(&mut m, false); test_scenario::return_shared(m); s.next_tx(@0xE); pay(&mut s, &c, memory, id, 1, 0); finish(s, c); }
    #[test, expected_failure(abort_code = 205, location = solvency_loop::autopilot)]
    fun expiry_stops_payments() { let (mut s, mut c, m, _) = setup(); let id = bill(&mut s, &c, 10, false); clock::increment_for_testing(&mut c, 30 * DAY); s.next_tx(@0xE); pay(&mut s, &c, m, id, 1, 0); finish(s, c); }
    #[test]
    fun upfront_deposit_stays_unsettled_until_creator_activation() {
        let (mut s, c, a, b) = setup(); let id = bill(&mut s, &c, 20, true); s.next_tx(@0xE); pay(&mut s, &c, a, id, 1, 0);
        s.next_tx(@0xB); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(b); let mut split = s.take_shared_by_id<GroupSplitEscrow<USDC>>(id); core::activate_group_split(&p, &m, &mut split, &c, s.ctx()); s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(split);
        s.next_tx(@0xB); let coin = s.take_from_sender<Coin<USDC>>(); assert!(coin.value() == 20); coin::burn_for_testing(coin); finish(s, c);
    }
    #[test, expected_failure(abort_code = 208, location = solvency_loop::autopilot)]
    fun group_requires_every_members_consent() {
        let (mut s, c, a, _) = setup(); s.next_tx(@0xA); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(a); let mut d = s.take_shared<AgentDirectory>(); autopilot::create_group_convention(&p, &m, &mut d, string::utf8(b"Utilities"), vector[@0xA,@0xB], vector[5000,5000], &c, s.ctx()); s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(d);
        s.next_tx(@0xE); let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); let m = s.take_shared_by_id<MemWalAccount>(a); let g = s.take_shared<GroupConvention>(); autopilot::create_conventional_split_by_agent(&mut v, &m, 0, &g, string::utf8(b"Utilities"), 20, vector[false], bytes(1), &c, s.ctx()); test_scenario::return_shared(v); test_scenario::return_shared(m); test_scenario::return_shared(g); finish(s, c);
    }
    #[test, expected_failure(abort_code = 202, location = solvency_loop::autopilot)]
    fun alternate_coin_cannot_be_used() {
        let (mut s, c, memory, _) = setup(); s.next_tx(@0xA); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(memory); let mut d = s.take_shared<AgentDirectory>();
        autopilot::create_agent_allowance_vault(&p, &m, &mut d, coin::mint_for_testing<SUI>(100, s.ctx()), coin::mint_for_testing<SUI>(10, s.ctx()), @0xE, account::derive_sui_address(&bytes(1)), 25, 40, DAY, true, true, false, vector[@0xB], &c, s.ctx()); s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(d); finish(s, c);
    }
    #[test, expected_failure(abort_code = 206, location = solvency_loop::autopilot)]
    fun removing_memwal_delegate_stops_payments_on_an_active_account() {
        let (mut s, c, memory, _) = setup(); let id = bill(&mut s, &c, 10, false); let mut m = s.take_shared_by_id<MemWalAccount>(memory); account::test_clear_delegates(&mut m); test_scenario::return_shared(m); s.next_tx(@0xE); pay(&mut s, &c, memory, id, 1, 0); finish(s, c);
    }
    #[test, expected_failure(abort_code = 205, location = solvency_loop::autopilot)]
    fun stale_command_cannot_execute_after_revocation_and_reactivation() {
        let (mut s, c, memory, _) = setup(); let id = bill(&mut s, &c, 10, false); s.next_tx(@0xA);
        let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(memory); let mut v = s.take_shared<AgentAllowanceVault<USDC>>();
        autopilot::revoke_agent_vault(&mut v, s.ctx()); autopilot::configure_agent_vault(&p, &m, &mut v, @0xE, account::derive_sui_address(&bytes(1)), 25, 40, DAY, true, true, true, vector[@0xB], &c, s.ctx());
        s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(v); s.next_tx(@0xE); pay(&mut s, &c, memory, id, 1, 0); finish(s, c);
    }
    #[test]
    fun unanimous_convention_uses_exact_weights_and_human_creator() {
        let (mut s, c, a, b) = setup(); s.next_tx(@0xA); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(a); let mut d = s.take_shared<AgentDirectory>();
        autopilot::create_group_convention(&p, &m, &mut d, string::utf8(b"Utilities"), vector[@0xA,@0xB], vector[4000,6000], &c, s.ctx()); s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(d);
        s.next_tx(@0xB); let p = s.take_from_sender<UserProfile>(); let m = s.take_shared_by_id<MemWalAccount>(b); let mut d = s.take_shared<AgentDirectory>(); let mut g = s.take_shared<GroupConvention>(); autopilot::consent_group_convention(&p, &m, &mut d, &mut g, true, &c, s.ctx()); s.return_to_sender(p); test_scenario::return_shared(m); test_scenario::return_shared(d); test_scenario::return_shared(g);
        s.next_tx(@0xE); let mut v = s.take_shared<AgentAllowanceVault<USDC>>(); let m = s.take_shared_by_id<MemWalAccount>(a); let g = s.take_shared<GroupConvention>(); autopilot::create_conventional_split_by_agent(&mut v, &m, 0, &g, string::utf8(b"Utilities"), 21, vector[false], bytes(3), &c, s.ctx()); test_scenario::return_shared(v); test_scenario::return_shared(m); test_scenario::return_shared(g);
        s.next_tx(@0xB); let split = s.take_shared<GroupSplitEscrow<USDC>>(); let (amount, recipient, upfront) = core::agent_share(&split, @0xB, &c); assert!(amount == 12 && recipient == @0xA && !upfront); test_scenario::return_shared(split); finish(s, c);
    }
}
