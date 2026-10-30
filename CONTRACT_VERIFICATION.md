# Contract and application alignment

Local review updated 2026-10-30. This records implementation checks and local tests, not an external audit or a claim that a package has been deployed.

## Mandatory MemWal membership

`register_user` takes `&memwal::account::MemWalAccount`, verifies the recorded owner equals the transaction sender and the account is active, then records `object::id_address(memory)` in that sender's profile. A nonzero address alone cannot register a user. The root manifest links the vendor dependency; `move/vendor/memwal/Published.toml` binds it to Mainnet MemWal package `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`.

Every financial entry point takes the wallet-owned UserProfile and actual MemWalAccount and verifies the profile wallet, account ownership and registered account link. Creating a split, funding escrow, activating a split, settling a share and locking new funds also require an active account. Cancellation, escrow refunds and matured withdrawals retain the ownership/link requirement but accept an inactive account so memory revocation/freezing cannot trap committed funds. The Move contract does not require the app's delegate to control payments; delegate grants are enforced by the application and memory API, while wallet signatures control the funds.

The UI shows only account/profile onboarding until ownership, active memory authorization and the profile link are confirmed. Transaction builders repeat fresh chain checks before constructing financial actions. Existing-member recovery is a separate restricted panel with no new-payment or new-lock controls. There is no guest/ID-free application payment path. Contacts may be entered after onboarding. A split may name a wallet before that wallet registers, but that wallet cannot fund or settle until it completes membership.

## Factory and ownership boundaries

- A single published Move package constructs one `UserProfile` per wallet. `register_user` alone mutates the shared registry, recording wallet → profile ID and incrementing the user count. It rejects repeat registration with code 113. Optional initial contacts are validated and saved in the same atomic transaction.
- Profiles have `UID` and only the `key` ability. They are transferred to their creating wallet inside the module, expose no transfer/deletion operation, and keep their recorded wallet unchanged. Their fields cannot be fabricated by other modules. Sui's owned-input rules and the explicit wallet guard both enforce ownership.
- Profile updates and contact operations accept `&mut UserProfile`; financial functions accept `&UserProfile`. None takes the global registry. Profile updates verify the genuine active MemWal account before linking it; contact changes verify the current linked account as well. The constructor is the proof of registration, so payment code does not need a global registry lookup.
- Bill escrows remain independent shared objects and cooldown vaults remain independent owner-held objects. The registry contains no profiles or funds. Registration and updates to the same bill still have shared-object contention; no performance or gas benchmark is claimed.
- The shared app/server reader checks the registry type, directory field type and wallet, then the profile object's type, UID, address ownership and recorded wallet. Missing/deleted objects, read failures and legacy nested profiles are errors, not new-user fallbacks. The memory API uses that reader before constructing a MemWal client.
- No extra environment fields are needed for users' profile IDs. This is a new initial-deployment layout; old packages with nested profiles require a planned migration rather than mixing old IDs with the current client.

## Builder/contract interface

Counts below exclude the implicit final transaction context. Every listed financial function is generic only over a coin type, which the contract restricts to native Circle USDC. App builders always use the fixed Circle USDC type. The registration account argument is an object input, not a pure address.

| Function | Explicit arguments | MemWal object position (zero-based) | Authorization |
| --- | ---: | ---: | --- |
| `register_user` | 7 | 2 | Actual active account owner, wallet not already registered, valid initial contacts |
| `update_profile` | 4 | 2 | Owned profile, actual active account owner |
| `add_contact`, `remove_contact` | 4 / 3 | 1 | Owned profile, active linked account |
| `create_group_split` | 8 | 1 | Registered account owner, active |
| `fund_split_share`, `settle_split_share` | 5 | 1 | Registered owner, active, exact unpaid participant share |
| `activate_group_split` | 4 | 1 | Registered owner, active, split creator, all required deposits funded |
| `cancel_group_split` | 3 | 1 | Registered account owner, split creator, pending split |
| `refund_escrow` | 4 | 1 | Registered account owner, funded payer, cancellation/deadline eligibility |
| `lock_in_cooldown_vault` | 6 | 1 | Registered owner, active, actual USDC reserve covers floor |
| `unlock_cooldown_vault` | 4 | 1 | Registered account owner, vault owner, maturity reached |

Only registration takes `&mut SolvencyRegistry`; every other first parameter is a profile reference. `src/lib/contract-interface.ts` records the expected arities and all parameter types, including reference mutability, contact vectors, coins, clocks, generics and transaction context. The readiness command also checks the profile's exact fields and key-only abilities. It rejects address-only registration, registry-based payments, incorrect argument shapes and transferable profile layouts. Application tests inspect actual transaction inputs, verify that non-registration transactions contain no registry input, and decode the factory's initial-contact vectors.

## Payment and custody checks

- The only accepted coin type is `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`, checked through original type IDs in Move. SUI pays network gas and is not an expense-payment option.
- Shares use integer micro-USDC, conserve the bill total, and retain a positive creator share. Duplicate/self/zero-wallet participants and invalid amounts are rejected.
- Upfront shares deposit exact USDC into contract escrow. Activation is creator-only and requires all required deposits; pending escrow is refunded under cancellation/deadline rules.
- Standard settlement requires the exact owed amount, prevents duplicate payment, and transfers to the recorded creator.
- Vault locks last exactly 24 hours. The contract consumes and returns a real reserve coin to the sender, enforces the registered liquidity floor and restricts unlock to the original owner after maturity. Vaults cannot be transferred through public transfer.
- Behavioral memory is committed separately after chain confirmation. A memory/relayer failure never switches payment mode or treats a confirmed transfer as unpaid. Its retry imports the verified event without paying again.

## Evidence and pending deployment checks

The earlier mandatory-membership implementation passed 32 application tests, 25 Move tests and seven production HTTP/authentication checks. The object-factory revision passed 36 application tests and 31 Move tests, typecheck/lint, production Move/app builds and the offline publish-bundle check. A fresh production server also passed five HTTP checks: home/config 200, memory GET 405, missing-origin POST 403 and unsigned same-origin POST 401; config exposed only setup status. These are local checks; wallet-approved Mainnet onboarding and financial execution remain untested until operator configuration/deployment.

Local Move tests include the original escrow/payment/cooldown checks plus atomic factory registration, unique directory IDs, duplicate-registration rejection, independent owner-only profile/contact updates, foreign-profile rejection, unregistered-wallet rejection, foreign MemWal owner rejection, wrong profile-account rejection, frozen-account spending/contact rejection and recovery after freezing. The unregistered tests deliberately supply another user's profile to verify the explicit wallet guard in addition to Sui's owned-input rule. Local application tests cover directory/profile ownership failures, atomic first registration, fresh contact replacement without a registry input, onboarding gates, all financial builders, live profile checks before memory access, signature/transport isolation and rejection of legacy deployed interfaces and transferable profile layouts.

`npm run move:verify-bundle` builds an offline publish bundle with RPC tree-shaking disabled. It requires exactly one application module (no dependency/test modules) and confirms the existing Mainnet MemWal package appears in the dependency list. This catches a package-manager compatibility issue that ordinary build/tests alone did not expose. It does not verify live on-chain bytecode or submit a transaction.

The MemWal public relayer `/config` and the official repository's app configuration agreed on Mainnet package/registry IDs on 2026-10-30. The vendored source and license are documented in `move/vendor/memwal/README.md`. Test-only fixtures are absent from production builds.

Still pending: on-chain dependency bytecode verification, publication dry-run, publication, real wallet onboarding/delegation and real USDC/MemWal writes. At the user's request, README.md now uses the installed Sui CLI against Sui's direct Mainnet endpoint for source verification and deployment, without a bridge or Tatum API key. Run dependency verification **before** publication, retain dependency verification during publish, then verify the published source. Complete the app's Tatum/MemWal configuration and run `npm run verify:mainnet` through the app's authenticated Tatum transport afterward. Do not replace a failed verification with a skip flag. Mainnet compatibility is confirmed only when the live deployment checks and application readiness checks succeed.
