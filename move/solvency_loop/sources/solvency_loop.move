module solvency_loop::core {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::dynamic_object_field as dof;
    use std::string::{String};
    use std::vector;

    // Error codes
    const EUnauthorized: u64 = 1;
    const EVaultStillLocked: u64 = 2;
    const EParticipantNotFound: u64 = 3;
    const EAlreadySettled: u64 = 4;
    const EInsufficientSplitAmount: u64 = 5;

    /// Shared Global Solvency Registry
    /// Zero Database Architecture: all profiles, social graphs, and vaults are bound here
    public struct SolvencyRegistry has key {
        id: UID,
        total_users: u64,
        total_settlements_processed: u64,
        registered_addresses: Table<address, bool>,
    }

    /// On-Chain User Profile (stored as dynamic object field on SolvencyRegistry or owned)
    public struct UserProfile has key, store {
        id: UID,
        owner: address,
        handle: String,
        trust_score: u64, // 0 - 100
        contacts: vector<address>,
        created_at_epoch: u64,
        total_settled_volume: u64,
    }

    /// Split Proposal stored as a shared object or referenced via Dynamic Field
    public struct SplitProposal<phantom CoinType> has key, store {
        id: UID,
        initiator: address,
        description: String,
        total_amount: u64,
        participants: vector<address>,
        shares: vector<u64>,
        settled_mask: vector<bool>,
        escrow: Balance<CoinType>,
        is_completed: bool,
    }

    /// Impulse Cooldown Vault holding locked funds until unlock epoch / timestamp
    public struct CooldownVault<phantom CoinType> has key, store {
        id: UID,
        owner: address,
        locked_balance: Balance<CoinType>,
        unlock_timestamp_ms: u64,
        created_timestamp_ms: u64,
        reason: String,
        guardian_approvals: vector<address>,
    }

    /// Module initializer creating the shared registry
    fun init(ctx: &mut TxContext) {
        let registry = SolvencyRegistry {
            id: object::new(ctx),
            total_users: 0,
            total_settlements_processed: 0,
            registered_addresses: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    /// Register a user profile on Sui Mainnet attached to the shared registry
    public entry fun register_profile(
        registry: &mut SolvencyRegistry,
        handle: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let profile = UserProfile {
            id: object::new(ctx),
            owner: sender,
            handle,
            trust_score: 100,
            contacts: vector::empty<address>(),
            created_at_epoch: tx_context::epoch(ctx),
            total_settled_volume: 0,
        };

        let profile_id = object::id(&profile);
        dof::add(&mut registry.id, sender, profile);
        table::add(&mut registry.registered_addresses, sender, true);
        registry.total_users = registry.total_users + 1;
    }

    /// Add a verified contact to the on-chain social graph
    public entry fun add_contact(
        registry: &mut SolvencyRegistry,
        contact: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let profile = dof::borrow_mut<address, UserProfile>(&mut registry.id, sender);
        assert!(profile.owner == sender, EUnauthorized);
        if (!vector::contains(&profile.contacts, &contact)) {
            vector::push_back(&mut profile.contacts, contact);
        };
    }

    /// Create an on-chain bill split proposal
    public entry fun create_split_proposal<CoinType>(
        description: String,
        participants: vector<address>,
        shares: vector<u64>,
        total_amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let len = vector::length(&participants);
        let mut settled_mask = vector::empty<bool>();
        let mut i = 0;
        while (i < len) {
            vector::push_back(&mut settled_mask, false);
            i = i + 1;
        };

        let proposal = SplitProposal<CoinType> {
            id: object::new(ctx),
            initiator: sender,
            description,
            total_amount,
            participants,
            shares,
            settled_mask,
            escrow: balance::zero<CoinType>(),
            is_completed: false,
        };

        transfer::share_object(proposal);
    }

    /// Settle a participant's share in a bill split
    public entry fun settle_share<CoinType>(
        registry: &mut SolvencyRegistry,
        proposal: &mut SplitProposal<CoinType>,
        payment: Coin<CoinType>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let payment_val = coin::value(&payment);

        let (found, index) = vector::index_of(&proposal.participants, &sender);
        assert!(found, EParticipantNotFound);

        let required_share = *vector::borrow(&proposal.shares, index);
        assert!(payment_val >= required_share, EInsufficientSplitAmount);

        let is_settled = vector::borrow_mut(&mut proposal.settled_mask, index);
        assert!(!*is_settled, EAlreadySettled);
        *is_settled = true;

        balance::join(&mut proposal.escrow, coin::into_balance(payment));
        registry.total_settlements_processed = registry.total_settlements_processed + 1;
    }

    /// Deposit funds into an impulse cooldown vault
    public entry fun create_cooldown_vault<CoinType>(
        funds: Coin<CoinType>,
        lock_duration_ms: u64,
        reason: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        let unlock_timestamp_ms = current_time + lock_duration_ms;

        let vault = CooldownVault<CoinType> {
            id: object::new(ctx),
            owner: sender,
            locked_balance: coin::into_balance(funds),
            unlock_timestamp_ms,
            created_timestamp_ms: current_time,
            reason,
            guardian_approvals: vector::empty<address>(),
        };

        transfer::share_object(vault);
    }

    /// Withdraw funds from cooldown vault after unlock timestamp
    public entry fun withdraw_cooldown_vault<CoinType>(
        vault: &mut CooldownVault<CoinType>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(vault.owner == sender, EUnauthorized);
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= vault.unlock_timestamp_ms, EVaultStillLocked);

        let amount = balance::value(&vault.locked_balance);
        let withdrawn_coin = coin::take(&mut vault.locked_balance, amount, ctx);
        transfer::public_transfer(withdrawn_coin, sender);
    }
}
