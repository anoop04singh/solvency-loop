module solvency_loop::core {
    use std::string::String;
    use std::type_name;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field as df;
    use sui::vec_map::{Self, VecMap};
    use sui::event;
    use memwal::account::{Self, MemWalAccount};

    const ECooldownStillActive: u64 = 101;
    const ENotAuthorized: u64 = 102;
    const EInvalidSplitAmount: u64 = 103;
    const EAlreadySettled: u64 = 104;
    const EInvalidParticipants: u64 = 106;
    const ENotActive: u64 = 107;
    const EInvalidState: u64 = 108;
    const ELiquidityFloor: u64 = 109;
    const EWrongCoin: u64 = 110;
    const EInvalidText: u64 = 111;
    const EMemWalRequired: u64 = 112;
    const EAlreadyRegistered: u64 = 113;
    const DAY_MS: u64 = 86_400_000;

    public struct SolvencyRegistry has key { id: UID, total_users: u64 }
    // Only this module can create or transfer profiles. A wallet has exactly one
    // profile, and its contacts can be updated without mutating the registry.
    public struct UserProfile has key {
        id: UID, wallet: address, handle: String, memwal_account_id: address,
        safe_floor_usdc: u64, contacts: VecMap<address, String>, registered_at_ms: u64,
    }
    public struct CooldownVault<phantom T> has key {
        id: UID, owner: address, locked_balance: Balance<T>, unlock_time_ms: u64,
        trigger_memory_namespace: String,
    }
    public struct ParticipantShare has store, copy, drop {
        debtor: address, amount_owed: u64, requires_upfront_escrow: bool,
        is_funded: bool, is_settled: bool, settled_at_ms: u64,
    }
    public struct GroupSplitEscrow<phantom T> has key {
        id: UID, creator: address, title: String, total_bill_amount: u64,
        creator_share: u64, escrowed_balance: Balance<T>,
        participants: VecMap<address, ParticipantShare>, pending_upfront: u64,
        is_active: bool, is_cancelled: bool, created_at_ms: u64, funding_deadline_ms: u64,
    }
    public struct UserRegisteredEvent has copy, drop {
        wallet: address, profile_id: ID, handle: String, memwal_account_id: address, safe_floor_usdc: u64,
    }
    public struct UserProfileUpdatedEvent has copy, drop {
        wallet: address, profile_id: ID, handle: String, memwal_account_id: address, safe_floor_usdc: u64,
    }
    public struct SplitCreatedEvent has copy, drop {
        split_id: ID, creator: address, title: String, total_amount: u64, created_at_ms: u64,
    }
    public struct ShareSettledEvent has copy, drop {
        split_id: ID, payer: address, recipient: address, amount: u64,
        was_escrow_enforced: bool, settled_at_ms: u64,
    }
    public struct EscrowFundedEvent has copy, drop { split_id: ID, payer: address, amount: u64 }
    public struct SplitActivatedEvent has copy, drop { split_id: ID, activated_at_ms: u64 }
    public struct EscrowRefundedEvent has copy, drop { split_id: ID, payer: address, amount: u64 }
    public struct CooldownLockedEvent has copy, drop {
        vault_id: ID, owner: address, amount: u64, unlock_time_ms: u64, namespace: String,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(SolvencyRegistry { id: object::new(ctx), total_users: 0 });
    }
    fun assert_usdc<T>() {
        assert!(
            type_name::with_original_ids<T>().into_string() ==
            std::ascii::string(b"dba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"),
            EWrongCoin,
        );
    }
    fun valid_text(text: &String, max: u64) { assert!(text.length() > 0 && text.length() <= max, EInvalidText); }

    fun assert_memory_owner(memory: &MemWalAccount, sender: address, active_required: bool) {
        assert!(account::owner(memory) == sender, EMemWalRequired);
        if (active_required) { assert!(account::is_active(memory) && !account::is_admin_quarantined(memory), EMemWalRequired); };
    }
    fun assert_onboarded(profile: &UserProfile, memory: &MemWalAccount, sender: address, active_required: bool) {
        assert!(profile.wallet == sender, ENotAuthorized);
        assert_memory_owner(memory, sender, active_required);
        assert!(profile.memwal_account_id == object::id_address(memory), EMemWalRequired);
    }
    public fun register_user(registry: &mut SolvencyRegistry, handle: String, memory: &MemWalAccount,
        safe_floor_usdc: u64, friend_wallets: vector<address>, friend_handles: vector<String>, clock: &Clock, ctx: &mut TxContext) {
        valid_text(&handle, 64);
        let sender = ctx.sender();
        assert_memory_owner(memory, sender, true);
        assert!(!df::exists(&registry.id, sender), EAlreadyRegistered);
        assert!(friend_wallets.length() == friend_handles.length(), EInvalidParticipants);
        let memwal_account_id = object::id_address(memory);
        let mut profile = UserProfile { id: object::new(ctx), wallet: sender, handle, memwal_account_id, safe_floor_usdc,
            contacts: vec_map::empty(), registered_at_ms: clock.timestamp_ms() };
        let mut i = 0;
        while (i < friend_wallets.length()) {
            let contact_wallet = friend_wallets[i];
            assert!(!profile.contacts.contains(&contact_wallet), EInvalidParticipants);
            put_contact(&mut profile, contact_wallet, friend_handles[i]);
            i = i + 1;
        };
        let profile_id = object::id(&profile);
        // Directory values are IDs, never nested profiles or shared balances.
        df::add(&mut registry.id, sender, profile_id);
        registry.total_users = registry.total_users + 1;
        event::emit(UserRegisteredEvent { wallet: sender, profile_id, handle, memwal_account_id, safe_floor_usdc });
        transfer::transfer(profile, sender);
    }
    public fun update_profile(profile: &mut UserProfile, handle: String, memory: &MemWalAccount,
        safe_floor_usdc: u64, ctx: &mut TxContext) {
        assert!(profile.wallet == ctx.sender(), ENotAuthorized);
        assert_memory_owner(memory, ctx.sender(), true);
        valid_text(&handle, 64);
        profile.handle = handle;
        profile.memwal_account_id = object::id_address(memory);
        profile.safe_floor_usdc = safe_floor_usdc;
        event::emit(UserProfileUpdatedEvent { wallet: ctx.sender(), profile_id: object::id(profile),
            handle, memwal_account_id: profile.memwal_account_id, safe_floor_usdc });
    }
    fun put_contact(profile: &mut UserProfile, friend_wallet: address, friend_handle: String) {
        assert!(friend_wallet != profile.wallet && friend_wallet != @0x0, EInvalidParticipants);
        valid_text(&friend_handle, 64);
        if (profile.contacts.contains(&friend_wallet)) { profile.contacts.remove(&friend_wallet); };
        profile.contacts.insert(friend_wallet, friend_handle);
    }
    public fun add_contact(profile: &mut UserProfile, memory: &MemWalAccount, friend_wallet: address, friend_handle: String, ctx: &mut TxContext) {
        assert_onboarded(profile, memory, ctx.sender(), true);
        put_contact(profile, friend_wallet, friend_handle);
    }
    public fun remove_contact(profile: &mut UserProfile, memory: &MemWalAccount, friend_wallet: address, ctx: &mut TxContext) {
        assert_onboarded(profile, memory, ctx.sender(), true);
        if (profile.contacts.contains(&friend_wallet)) { profile.contacts.remove(&friend_wallet); };
    }

    public fun create_group_split<T>(profile: &UserProfile, memory: &MemWalAccount, title: String, total_bill_amount: u64, debtors: vector<address>,
        amounts: vector<u64>, escrow_flags: vector<bool>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), true);
        valid_text(&title, 120);
        let len = debtors.length();
        assert!(len > 0 && len <= 64 && amounts.length() == len && escrow_flags.length() == len, EInvalidParticipants);
        let mut participants = vec_map::empty<address, ParticipantShare>();
        let mut i = 0;
        let mut owed = 0;
        let mut pending_upfront = 0;
        while (i < len) {
            let debtor = debtors[i];
            let amount = amounts[i];
            assert!(debtor != ctx.sender() && debtor != @0x0 && !participants.contains(&debtor), EInvalidParticipants);
            assert!(amount > 0 && amount <= total_bill_amount, EInvalidSplitAmount);
            owed = owed + amount;
            if (escrow_flags[i]) { pending_upfront = pending_upfront + 1; };
            participants.insert(debtor, ParticipantShare {
                debtor, amount_owed: amount, requires_upfront_escrow: escrow_flags[i],
                is_funded: false, is_settled: false, settled_at_ms: 0,
            });
            i = i + 1;
        };
        assert!(total_bill_amount > owed, EInvalidSplitAmount);
        let now = clock.timestamp_ms();
        let split = GroupSplitEscrow<T> {
            id: object::new(ctx), creator: ctx.sender(), title, total_bill_amount,
            creator_share: total_bill_amount - owed, escrowed_balance: balance::zero(),
            participants, pending_upfront, is_active: pending_upfront == 0,
            is_cancelled: false, created_at_ms: now, funding_deadline_ms: now + DAY_MS,
        };
        event::emit(SplitCreatedEvent { split_id: object::id(&split), creator: ctx.sender(), title, total_amount: total_bill_amount, created_at_ms: now });
        transfer::share_object(split);
    }
    public fun fund_split_share<T>(profile: &UserProfile, memory: &MemWalAccount, split: &mut GroupSplitEscrow<T>, payment: Coin<T>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), true);
        assert!(!split.is_active && !split.is_cancelled && clock.timestamp_ms() <= split.funding_deadline_ms, EInvalidState);
        let payer = ctx.sender();
        let split_id = object::id(split);
        let share = split.participants.get_mut(&payer);
        assert!(share.requires_upfront_escrow && !share.is_funded && !share.is_settled, EInvalidState);
        let amount = share.amount_owed;
        assert!(payment.value() == amount, EInvalidSplitAmount);
        share.is_funded = true;
        split.pending_upfront = split.pending_upfront - 1;
        split.escrowed_balance.join(payment.into_balance());
        event::emit(EscrowFundedEvent { split_id, payer, amount });
    }
    public fun activate_group_split<T>(profile: &UserProfile, memory: &MemWalAccount, split: &mut GroupSplitEscrow<T>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), true);
        assert!(ctx.sender() == split.creator, ENotAuthorized);
        assert!(!split.is_active && !split.is_cancelled && split.pending_upfront == 0 && clock.timestamp_ms() <= split.funding_deadline_ms, EInvalidState);
        let split_id = object::id(split);
        let now = clock.timestamp_ms();
        let keys = split.participants.keys();
        let mut i = 0;
        while (i < keys.length()) {
            let payer = keys[i];
            let share = split.participants.get_mut(&payer);
            if (share.is_funded) {
                share.is_settled = true;
                share.settled_at_ms = now;
                event::emit(ShareSettledEvent { split_id, payer, recipient: split.creator,
                    amount: share.amount_owed, was_escrow_enforced: true, settled_at_ms: now });
            };
            i = i + 1;
        };
        split.is_active = true;
        let funds = split.escrowed_balance.withdraw_all();
        if (funds.value() > 0) { transfer::public_transfer(coin::from_balance(funds, ctx), split.creator); }
        else { funds.destroy_zero(); };
        event::emit(SplitActivatedEvent { split_id, activated_at_ms: now });
    }
    public fun cancel_group_split<T>(profile: &UserProfile, memory: &MemWalAccount, split: &mut GroupSplitEscrow<T>, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), false);
        assert!(ctx.sender() == split.creator, ENotAuthorized);
        assert!(!split.is_active, EInvalidState);
        split.is_cancelled = true;
    }
    #[allow(lint(self_transfer))]
    public fun refund_escrow<T>(profile: &UserProfile, memory: &MemWalAccount, split: &mut GroupSplitEscrow<T>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), false);
        assert!(!split.is_active && (split.is_cancelled || clock.timestamp_ms() > split.funding_deadline_ms), EInvalidState);
        let split_id = object::id(split);
        let payer = ctx.sender();
        let share = split.participants.get_mut(&payer);
        assert!(share.is_funded && !share.is_settled, EInvalidState);
        let amount = share.amount_owed;
        share.is_funded = false;
        split.pending_upfront = split.pending_upfront + 1;
        let funds = split.escrowed_balance.split(amount);
        transfer::public_transfer(coin::from_balance(funds, ctx), payer);
        event::emit(EscrowRefundedEvent { split_id, payer, amount });
    }
    public fun settle_split_share<T>(profile: &UserProfile, memory: &MemWalAccount, split: &mut GroupSplitEscrow<T>, payment: Coin<T>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), true);
        assert!(split.is_active && !split.is_cancelled, ENotActive);
        let split_id = object::id(split);
        let payer = ctx.sender();
        let share = split.participants.get_mut(&payer);
        assert!(!share.is_settled, EAlreadySettled);
        assert!(payment.value() == share.amount_owed, EInvalidSplitAmount);
        let amount = share.amount_owed;
        let was_escrow_enforced = share.requires_upfront_escrow;
        share.is_settled = true;
        share.settled_at_ms = clock.timestamp_ms();
        transfer::public_transfer(payment, split.creator);
        event::emit(ShareSettledEvent { split_id, payer, recipient: split.creator, amount,
            was_escrow_enforced, settled_at_ms: clock.timestamp_ms() });
    }
    // Consume and return the reserve to the sender. A borrowed coin belonging to
    // somebody else cannot be presented as proof of the sender's liquidity.
    #[allow(lint(self_transfer))]
    public fun lock_in_cooldown_vault<T>(profile: &UserProfile, memory: &MemWalAccount, funds: Coin<T>, reserve: Coin<T>,
        trigger_memory_namespace: String, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        let sender = ctx.sender();
        assert_onboarded(profile, memory, sender, true);
        assert!(reserve.value() >= profile.safe_floor_usdc, ELiquidityFloor);
        transfer::public_transfer(reserve, sender);
        assert!(funds.value() > 0, EInvalidSplitAmount);
        valid_text(&trigger_memory_namespace, 128);
        let amount = funds.value();
        let unlock_time_ms = clock.timestamp_ms() + DAY_MS;
        let vault = CooldownVault<T> { id: object::new(ctx), owner: sender, locked_balance: funds.into_balance(),
            unlock_time_ms, trigger_memory_namespace };
        event::emit(CooldownLockedEvent { vault_id: object::id(&vault), owner: sender, amount,
            unlock_time_ms, namespace: trigger_memory_namespace });
        transfer::transfer(vault, sender);
    }
    public fun unlock_cooldown_vault<T>(profile: &UserProfile, memory: &MemWalAccount, vault: CooldownVault<T>, clock: &Clock, ctx: &mut TxContext) {
        assert_usdc<T>();
        assert_onboarded(profile, memory, ctx.sender(), false);
        let CooldownVault { id, owner, locked_balance, unlock_time_ms, trigger_memory_namespace: _ } = vault;
        assert!(ctx.sender() == owner, ENotAuthorized);
        assert!(clock.timestamp_ms() >= unlock_time_ms, ECooldownStillActive);
        id.delete();
        transfer::public_transfer(coin::from_balance(locked_balance, ctx), owner);
    }

    #[test_only] public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }
    #[test_only] public fun profile_id_for_testing(r: &SolvencyRegistry, wallet: address): ID { *df::borrow(&r.id, wallet) }
    #[test_only] public fun profile_for_testing(p: &UserProfile): (address, String, u64, u64) { (p.wallet, p.handle, p.safe_floor_usdc, p.contacts.length()) }
    #[test_only] public fun users_for_testing(r: &SolvencyRegistry): u64 { r.total_users }
    #[test_only] public fun state_for_testing<T>(s: &GroupSplitEscrow<T>): (bool, u64, u64) { (s.is_active, s.pending_upfront, s.escrowed_balance.value()) }
    #[test_only] public fun settled_for_testing<T>(s: &GroupSplitEscrow<T>, debtor: address): bool { s.participants.get(&debtor).is_settled }
}
