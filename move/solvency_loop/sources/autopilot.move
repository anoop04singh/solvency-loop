/// Explicit, revocable authority over pre-funded USDC. Existing owned profiles,
/// escrows and manual entry points keep their original layouts and signatures.
module solvency_loop::autopilot {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field as df;
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use sui::event;
    use memwal::account::{Self, MemWalAccount};
    use solvency_loop::core::{Self, UserProfile, GroupSplitEscrow};
    const EUnauthorized: u64 = 201;
    const EInvalidPolicy: u64 = 202;
    const ELimit: u64 = 203;
    const EDailyLimit: u64 = 204;
    const EInactive: u64 = 205;
    const EMemory: u64 = 206;
    const EReplay: u64 = 207;
    const EPeer: u64 = 208;
    const ERate: u64 = 209;
    const DAY: u64 = 86_400_000;
    public struct AgentDirectory has key { id: UID, vaults: Table<address, ID>, social: Table<address, ID>, groups: Table<address, vector<ID>> }
    public struct Debit has store, copy, drop { at_ms: u64, amount: u64, digest: vector<u8> }
    public struct AgentAllowanceVault<phantom T> has key {
        id: UID, owner: address, profile_id: ID, memory_id: address, memory_delegate: address,
        agent_executor: address, allowance_balance: Balance<T>, max_per_tx: u64, daily_limit: u64,
        expires_at_ms: u64, active: bool, epoch: u64, allow_create: bool, allow_incoming: bool, allow_cooldown: bool,
        payees: vector<address>, history: vector<Debit>,
    }
    public struct AgentReceipt has store, copy, drop { digest: vector<u8>, kind: u8, object_id: ID, amount: u64, at_ms: u64 }
    public struct AgentActionEvent has copy, drop {
        vault_id: ID, owner: address, executor: address, request_id: vector<u8>, object_id: ID,
        kind: u8, amount: u64, remaining: u64, at_ms: u64,
    }
    public struct AgentVaultCreatedEvent has copy, drop { owner: address, vault_id: ID }
    public struct PublicSocialProfile has key { id: UID, owner: address, active: bool, exclude_alcohol: bool, vegetarian: bool, updated_at_ms: u64 }
    public struct GroupConvention has key { id: UID, creator: address, title: String, weights: VecMap<address, u64>, approvals: VecMap<address, bool>, updated_at_ms: u64 }
    public struct GroupConventionCreatedEvent has copy, drop { group_id: ID, creator: address, members: vector<address> }

    public fun create_agent_directory(ctx: &mut TxContext) {
        transfer::share_object(AgentDirectory { id: object::new(ctx), vaults: table::new(ctx), social: table::new(ctx), groups: table::new(ctx) });
    }
    fun usdc<T>() { assert!(std::type_name::with_original_ids<T>().into_string() == std::ascii::string(b"dba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"), EInvalidPolicy); }
    fun memory(v: address, delegate: address, m: &MemWalAccount) {
        assert!(account::owner(m) == v && account::is_active(m) && !account::is_admin_quarantined(m), EMemory);
        let mut found = false; let mut i = 0;
        while (i < account::delegate_count(m)) { if (account::delegate_address_at(m, i) == delegate) { found = true; }; i = i + 1; };
        assert!(found, EMemory);
    }
    fun policy(per_tx: u64, daily: u64, expires: u64, clock: &Clock) {
        assert!(per_tx > 0 && daily >= per_tx && expires > clock.timestamp_ms() && expires <= clock.timestamp_ms() + 30 * DAY, EInvalidPolicy);
    }
    fun peers(allowed: &vector<address>, contacts: &vector<address>, owner: address) {
        assert!(allowed.length() <= 64, EPeer); let mut seen = vector[]; let mut i = 0;
        while (i < allowed.length()) { let p = allowed[i]; assert!(p != owner && p != @0x0 && contacts.contains(&p) && !seen.contains(&p), EPeer); seen.push_back(p); i = i + 1; };
    }
    #[allow(lint(self_transfer))]
    public fun create_agent_allowance_vault<T>(profile: &UserProfile, m: &MemWalAccount, directory: &mut AgentDirectory,
        deposit: Coin<T>, reserve: Coin<T>, executor: address, delegate: address, per_tx: u64, daily: u64,
        expires: u64, allow_create: bool, allow_incoming: bool, allow_cooldown: bool, payees: vector<address>, clock: &Clock, ctx: &mut TxContext) {
        usdc<T>(); let (owner, profile_id, memory_id, floor, contacts) = core::delegation_profile(profile, m, ctx);
        memory(owner, delegate, m); policy(per_tx, daily, expires, clock); peers(&payees, &contacts, owner);
        assert!(!directory.vaults.contains(owner) && executor != @0x0 && executor != owner && deposit.value() > 0 && reserve.value() >= floor, EInvalidPolicy);
        transfer::public_transfer(reserve, owner);
        let v = AgentAllowanceVault { id: object::new(ctx), owner, profile_id, memory_id, memory_delegate: delegate, agent_executor: executor,
            allowance_balance: deposit.into_balance(), max_per_tx: per_tx, daily_limit: daily, expires_at_ms: expires, active: true, epoch: 0,
            allow_create, allow_incoming, allow_cooldown, payees, history: vector[] };
        let vault_id = object::id(&v); directory.vaults.add(owner, vault_id);
        event::emit(AgentVaultCreatedEvent { owner, vault_id }); transfer::share_object(v);
    }
    public fun configure_agent_vault<T>(profile: &UserProfile, m: &MemWalAccount, v: &mut AgentAllowanceVault<T>, executor: address, delegate: address,
        per_tx: u64, daily: u64, expires: u64, allow_create: bool, allow_incoming: bool, allow_cooldown: bool, payees: vector<address>, clock: &Clock, ctx: &mut TxContext) {
        let (owner, profile_id, memory_id, _, contacts) = core::delegation_profile(profile, m, ctx);
        assert!(owner == v.owner && profile_id == v.profile_id && executor != @0x0 && executor != owner, EUnauthorized);
        memory(owner, delegate, m); policy(per_tx, daily, expires, clock); peers(&payees, &contacts, owner);
        v.memory_id = memory_id; v.memory_delegate = delegate; v.agent_executor = executor; v.max_per_tx = per_tx; v.daily_limit = daily;
        v.expires_at_ms = expires; v.allow_create = allow_create; v.allow_incoming = allow_incoming; v.allow_cooldown = allow_cooldown; v.payees = payees; v.active = true; v.epoch = v.epoch + 1;
        // Neither reconfiguration nor funding clears the rolling spend history or replay records.
    }
    public fun revoke_agent_vault<T>(v: &mut AgentAllowanceVault<T>, ctx: &mut TxContext) { assert!(ctx.sender() == v.owner, EUnauthorized); v.active = false; v.epoch = v.epoch + 1; }
    public fun withdraw_from_agent_vault<T>(v: &mut AgentAllowanceVault<T>, amount: u64, ctx: &mut TxContext) {
        assert!(ctx.sender() == v.owner && amount > 0, EUnauthorized);
        v.epoch = v.epoch + 1; let c = coin::take(&mut v.allowance_balance, amount, ctx); transfer::public_transfer(c, v.owner);
    }
    #[allow(lint(self_transfer))]
    public fun top_up_agent_vault<T>(profile: &UserProfile, m: &MemWalAccount, v: &mut AgentAllowanceVault<T>, deposit: Coin<T>, reserve: Coin<T>, ctx: &mut TxContext) {
        usdc<T>(); let (owner, profile_id, memory_id, floor, _) = core::delegation_profile(profile, m, ctx);
        assert!(owner == v.owner && profile_id == v.profile_id && memory_id == v.memory_id && reserve.value() >= floor && deposit.value() > 0, EUnauthorized);
        v.allowance_balance.join(deposit.into_balance()); transfer::public_transfer(reserve, owner);
    }
    fun authorize<T>(v: &AgentAllowanceVault<T>, m: &MemWalAccount, request: &vector<u8>, expected_epoch: u64, clock: &Clock, ctx: &TxContext) {
        usdc<T>(); assert!(ctx.sender() == v.agent_executor, EUnauthorized);
        assert!(v.active && v.epoch == expected_epoch && clock.timestamp_ms() < v.expires_at_ms, EInactive);
        assert!(object::id_address(m) == v.memory_id, EMemory); memory(v.owner, v.memory_delegate, m);
        assert!(request.length() == 32 && !df::exists(&v.id, *request), EReplay);
    }
    fun debit<T>(v: &mut AgentAllowanceVault<T>, amount: u64, clock: &Clock, ctx: &TxContext) {
        let now = clock.timestamp_ms(); let mut total = 0; let mut in_tx = 0; let mut i = 0;
        while (i < v.history.length()) {
            if (now >= v.history[i].at_ms && now - v.history[i].at_ms >= DAY) { v.history.remove(i); }
            else { total = total + v.history[i].amount; if (v.history[i].digest == *ctx.digest()) { in_tx = in_tx + v.history[i].amount; }; i = i + 1; };
        };
        assert!(v.history.length() < 64, ERate);
        assert!(in_tx <= v.max_per_tx && amount <= v.max_per_tx - in_tx && amount <= v.allowance_balance.value(), ELimit);
        assert!(total <= v.daily_limit && amount <= v.daily_limit - total, EDailyLimit);
        v.history.push_back(Debit { at_ms: now, amount, digest: *ctx.digest() });
    }
    fun receipt<T>(v: &mut AgentAllowanceVault<T>, request: vector<u8>, kind: u8, object_id: ID, amount: u64, clock: &Clock, ctx: &TxContext) {
        let at_ms = clock.timestamp_ms();
        df::add(&mut v.id, request, AgentReceipt { digest: *ctx.digest(), kind, object_id, amount, at_ms });
        event::emit(AgentActionEvent { vault_id: object::id(v), owner: v.owner, executor: ctx.sender(), request_id: request, object_id, kind, amount, remaining: v.allowance_balance.value(), at_ms });
    }
    public fun create_group_split_by_agent<T>(v: &mut AgentAllowanceVault<T>, m: &MemWalAccount, expected_epoch: u64, title: String, total: u64,
        debtors: vector<address>, amounts: vector<u64>, flags: vector<bool>, request: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
        authorize(v, m, &request, expected_epoch, clock, ctx); assert!(v.allow_create && total <= v.max_per_tx, ELimit);
        let mut i = 0; while (i < debtors.length()) { assert!(v.payees.contains(&debtors[i]), EPeer); i = i + 1; };
        debit(v, 0, clock, ctx); let id = core::create_split_for<T>(v.owner, title, total, debtors, amounts, flags, clock, ctx);
        receipt(v, request, 0, id, 0, clock, ctx);
    }
    public fun settle_share_by_agent<T>(v: &mut AgentAllowanceVault<T>, m: &MemWalAccount, expected_epoch: u64, split: &mut GroupSplitEscrow<T>, request: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
        authorize(v, m, &request, expected_epoch, clock, ctx);
        let (amount, recipient, upfront) = core::agent_share(split, v.owner, clock); assert!(v.payees.contains(&recipient), EPeer);
        debit(v, amount, clock, ctx); let payment = coin::take(&mut v.allowance_balance, amount, ctx);
        if (upfront) { core::fund_for(v.owner, split, payment, clock, ctx); } else { core::settle_for(v.owner, split, payment, clock, ctx); };
        receipt(v, request, if (upfront) 2 else 1, object::id(split), amount, clock, ctx);
    }
    public fun create_conventional_split_by_agent<T>(v: &mut AgentAllowanceVault<T>, m: &MemWalAccount, expected_epoch: u64, group: &GroupConvention,
        title: String, total: u64, flags: vector<bool>, request: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
        assert!(group.weights.contains(&v.owner), EPeer);
        let keys = group.weights.keys(); let mut debtors = vector[]; let mut amounts = vector[]; let mut i = 0;
        while (i < keys.length()) { let p = keys[i]; assert!(*group.approvals.get(&p), EPeer);
            if (p != v.owner) { debtors.push_back(p); amounts.push_back((((total as u128) * (*group.weights.get(&p) as u128)) / 10000) as u64); }; i = i + 1; };
        create_group_split_by_agent(v, m, expected_epoch, title, total, debtors, amounts, flags, request, clock, ctx);
    }
    public fun activate_split_by_agent<T>(v: &mut AgentAllowanceVault<T>, m: &MemWalAccount, expected_epoch: u64, split: &mut GroupSplitEscrow<T>, request: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
        authorize(v, m, &request, expected_epoch, clock, ctx); assert!(v.allow_create, EUnauthorized); debit(v, 0, clock, ctx);
        core::activate_for(v.owner, split, clock, ctx); receipt(v, request, 3, object::id(split), 0, clock, ctx);
    }
    public fun protect_by_agent<T>(v: &mut AgentAllowanceVault<T>, m: &MemWalAccount, expected_epoch: u64, amount: u64, request: vector<u8>, clock: &Clock, ctx: &mut TxContext) {
        authorize(v, m, &request, expected_epoch, clock, ctx); assert!(v.allow_cooldown && amount > 0, EUnauthorized); debit(v, amount, clock, ctx);
        let c = coin::take(&mut v.allowance_balance, amount, ctx); let id = core::cooldown_for(v.owner, c, string::utf8(b"habit_regret"), clock, ctx);
        receipt(v, request, 4, id, amount, clock, ctx);
    }
    public fun create_public_preferences(profile: &UserProfile, m: &MemWalAccount, d: &mut AgentDirectory, alcohol: bool, vegetarian: bool, clock: &Clock, ctx: &mut TxContext) {
        let (owner, _, _, _, _) = core::delegation_profile(profile, m, ctx); assert!(!d.social.contains(owner), EInvalidPolicy);
        let s = PublicSocialProfile { id: object::new(ctx), owner, active: true, exclude_alcohol: alcohol, vegetarian, updated_at_ms: clock.timestamp_ms() };
        d.social.add(owner, object::id(&s)); transfer::share_object(s);
    }
    public fun update_public_preferences(profile: &UserProfile, m: &MemWalAccount, s: &mut PublicSocialProfile, alcohol: bool, vegetarian: bool, clock: &Clock, ctx: &mut TxContext) {
        let (owner, _, _, _, _) = core::delegation_profile(profile, m, ctx); assert!(owner == s.owner, EUnauthorized);
        s.active = true; s.exclude_alcohol = alcohol; s.vegetarian = vegetarian; s.updated_at_ms = clock.timestamp_ms();
    }
    public fun revoke_public_preferences(s: &mut PublicSocialProfile, ctx: &mut TxContext) { assert!(ctx.sender() == s.owner, EUnauthorized); s.active = false; }
    public fun create_group_convention(profile: &UserProfile, m: &MemWalAccount, d: &mut AgentDirectory, title: String, members: vector<address>, weights: vector<u64>, clock: &Clock, ctx: &mut TxContext) {
        let (owner, _, _, _, contacts) = core::delegation_profile(profile, m, ctx);
        assert!(title.length() > 0 && title.length() <= 120 && members.length() > 1 && members.length() <= 65 && members.length() == weights.length(), EInvalidPolicy);
        let mut group = GroupConvention { id: object::new(ctx), creator: owner, title, weights: vec_map::empty(), approvals: vec_map::empty(), updated_at_ms: clock.timestamp_ms() };
        let mut i = 0; let mut sum = 0;
        while (i < members.length()) { let p = members[i]; assert!((p == owner || contacts.contains(&p)) && !group.weights.contains(&p) && weights[i] > 0, EPeer);
            group.weights.insert(p, weights[i]); group.approvals.insert(p, p == owner); sum = sum + weights[i]; i = i + 1; };
        assert!(sum == 10000 && group.weights.contains(&owner), EInvalidPolicy); let group_id = object::id(&group);
        if (!d.groups.contains(owner)) { d.groups.add(owner, vector[]); }; assert!(d.groups.borrow(owner).length() < 64, ERate); d.groups.borrow_mut(owner).push_back(group_id);
        // Proposed groups cannot fill another wallet's accepted-group directory.
        event::emit(GroupConventionCreatedEvent { group_id, creator: owner, members }); transfer::share_object(group);
    }
    public fun consent_group_convention(profile: &UserProfile, m: &MemWalAccount, d: &mut AgentDirectory, group: &mut GroupConvention, accept: bool, clock: &Clock, ctx: &mut TxContext) {
        let (owner, _, _, _, _) = core::delegation_profile(profile, m, ctx); assert!(group.approvals.contains(&owner), EUnauthorized);
        *group.approvals.get_mut(&owner) = accept; group.updated_at_ms = clock.timestamp_ms();
        let id = object::id(group); if (accept) { if (!d.groups.contains(owner)) { d.groups.add(owner, vector[]); }; let ids = d.groups.borrow_mut(owner); if (!ids.contains(&id)) { assert!(ids.length() < 64, ERate); ids.push_back(id); }; };
    }
    public fun revoke_group_consent(group: &mut GroupConvention, ctx: &mut TxContext) { let owner = ctx.sender(); assert!(group.approvals.contains(&owner), EUnauthorized); *group.approvals.get_mut(&owner) = false; }
    #[test_only]
    public fun vault_state<T>(v: &AgentAllowanceVault<T>): (u64, u64, bool) { let mut n = 0; let mut i = 0; while (i < v.history.length()) { n = n + v.history[i].amount; i = i + 1; }; (v.allowance_balance.value(), n, v.active) }
}
