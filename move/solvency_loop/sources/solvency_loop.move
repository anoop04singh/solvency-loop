module solvency_loop::core {
    use std::string::{String};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field as df;
    use sui::vec_map::{Self, VecMap};
    use sui::event;

    // === Error Constants ===
    const ECooldownStillActive: u64 = 101;
    const ENotAuthorized: u64 = 102;
    const EInvalidSplitAmount: u64 = 103;
    const EAlreadySettled: u64 = 104;
    const EProfileNotFound: u64 = 105;

    // === 1. Shared On-Chain User Registry (Zero-DB User & Contact Management) ===
    public struct SolvencyRegistry has key {
        id: UID,
        total_users: u64,
    }

    public struct UserProfile has store, copy, drop {
        wallet: address,
        handle: String,
        memwal_account_id: address,
        safe_floor_usdc: u64,
        contacts: VecMap<address, String>,
        registered_at_ms: u64,
    }

    // === 2. Regret-Shielded 24-Hour Cooldown Vault ===
    public struct CooldownVault<phantom T> has key, store {
        id: UID,
        owner: address,
        locked_balance: Balance<T>,
        unlock_time_ms: u64,
        trigger_memory_namespace: String,
    }

    // === 3. Multi-Wallet Group Split & Upfront Micro-Escrow ===
    public struct ParticipantShare has store, copy, drop {
        debtor: address,
        amount_owed: u64,
        requires_upfront_escrow: bool,
        is_settled: bool,
        settled_at_ms: u64,
    }

    public struct GroupSplitEscrow<phantom T> has key {
        id: UID,
        creator: address,
        title: String,
        total_bill_amount: u64,
        escrowed_balance: Balance<T>,
        participants: VecMap<address, ParticipantShare>,
        created_at_ms: u64,
    }

    // === Events for Tatum RPC Indexing (suix_queryEvents) ===
    public struct UserRegisteredEvent has copy, drop {
        wallet: address,
        handle: String,
        memwal_account_id: address,
        safe_floor_usdc: u64,
    }

    public struct SplitCreatedEvent has copy, drop {
        split_id: ID,
        creator: address,
        title: String,
        total_amount: u64,
        created_at_ms: u64,
    }

    public struct ShareSettledEvent has copy, drop {
        split_id: ID,
        payer: address,
        recipient: address,
        amount: u64,
        was_escrow_enforced: bool,
        settled_at_ms: u64,
    }

    public struct CooldownLockedEvent has copy, drop {
        vault_id: ID,
        owner: address,
        amount: u64,
        unlock_time_ms: u64,
        namespace: String,
    }

    fun init(ctx: &mut TxContext) {
        let registry = SolvencyRegistry {
            id: object::new(ctx),
            total_users: 0,
        };
        transfer::share_object(registry);
    }

    public entry fun register_user(
        registry: &mut SolvencyRegistry,
        handle: String,
        memwal_account_id: address,
        safe_floor_usdc: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        if (df::exists_(&registry.id, sender)) {
            let profile: &mut UserProfile = df::borrow_mut(&mut registry.id, sender);
            profile.handle = handle;
            profile.memwal_account_id = memwal_account_id;
            profile.safe_floor_usdc = safe_floor_usdc;
        } else {
            let profile = UserProfile {
                wallet: sender,
                handle,
                memwal_account_id,
                safe_floor_usdc,
                contacts: vec_map::empty(),
                registered_at_ms: clock::timestamp_ms(clock),
            };
            df::add(&mut registry.id, sender, profile);
            registry.total_users = registry.total_users + 1;
        };

        event::emit(UserRegisteredEvent {
            wallet: sender,
            handle,
            memwal_account_id,
            safe_floor_usdc,
        });
    }

    public entry fun add_contact(
        registry: &mut SolvencyRegistry,
        friend_wallet: address,
        friend_handle: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(df::exists_(&registry.id, sender), EProfileNotFound);
        let profile: &mut UserProfile = df::borrow_mut(&mut registry.id, sender);
        if (vec_map::contains(&profile.contacts, &friend_wallet)) {
            let (_, _) = vec_map::remove(&mut profile.contacts, &friend_wallet);
        };
        vec_map::insert(&mut profile.contacts, friend_wallet, friend_handle);
    }

    public entry fun create_group_split<T>(
        title: String,
        total_bill_amount: u64,
        debtors: vector<address>,
        amounts: vector<u64>,
        escrow_flags: vector<bool>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let mut participants = vec_map::empty<address, ParticipantShare>();
        let len = vector::length(&debtors);
        let mut i = 0;

        while (i < len) {
            let debtor = *vector::borrow(&debtors, i);
            let amount_owed = *vector::borrow(&amounts, i);
            let requires_escrow = *vector::borrow(&escrow_flags, i);

            vec_map::insert(&mut participants, debtor, ParticipantShare {
                debtor,
                amount_owed,
                requires_upfront_escrow: requires_escrow,
                is_settled: false,
                settled_at_ms: 0,
            });
            i = i + 1;
        };

        let now = clock::timestamp_ms(clock);
        let escrow = GroupSplitEscrow<T> {
            id: object::new(ctx),
            creator: sender,
            title,
            total_bill_amount,
            escrowed_balance: balance::zero<T>(),
            participants,
            created_at_ms: now,
        };

        let split_id = object::id(&escrow);
        event::emit(SplitCreatedEvent {
            split_id,
            creator: sender,
            title,
            total_amount: total_bill_amount,
            created_at_ms: now,
        });

        transfer::share_object(escrow);
    }

    public entry fun settle_split_share<T>(
        split: &mut GroupSplitEscrow<T>,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let payer = tx_context::sender(ctx);
        let share: &mut ParticipantShare = vec_map::get_mut(&mut split.participants, &payer);
        assert!(!share.is_settled, EAlreadySettled);
        assert!(coin::value(&payment) >= share.amount_owed, EInvalidSplitAmount);

        let now = clock::timestamp_ms(clock);
        share.is_settled = true;
        share.settled_at_ms = now;

        transfer::public_transfer(payment, split.creator);

        event::emit(ShareSettledEvent {
            split_id: object::id(split),
            payer,
            recipient: split.creator,
            amount: share.amount_owed,
            was_escrow_enforced: share.requires_upfront_escrow,
            settled_at_ms: now,
        });
    }

    public entry fun lock_in_cooldown_vault<T>(
        funds: Coin<T>,
        lock_duration_ms: u64,
        trigger_memory_namespace: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&funds);
        let unlock_time_ms = clock::timestamp_ms(clock) + lock_duration_ms;

        let vault = CooldownVault<T> {
            id: object::new(ctx),
            owner: sender,
            locked_balance: coin::into_balance(funds),
            unlock_time_ms,
            trigger_memory_namespace,
        };

        event::emit(CooldownLockedEvent {
            vault_id: object::id(&vault),
            owner: sender,
            amount,
            unlock_time_ms,
            namespace: trigger_memory_namespace,
        });

        transfer::public_transfer(vault, sender);
    }

    public entry fun unlock_cooldown_vault<T>(
        vault: CooldownVault<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let CooldownVault { id, owner, locked_balance, unlock_time_ms, trigger_memory_namespace: _ } = vault;
        assert!(tx_context::sender(ctx) == owner, ENotAuthorized);
        assert!(clock::timestamp_ms(clock) >= unlock_time_ms, ECooldownStillActive);

        object::delete(id);
        let unlocked_coin = coin::from_balance(locked_balance, ctx);
        transfer::public_transfer(unlocked_coin, owner);
    }
}
