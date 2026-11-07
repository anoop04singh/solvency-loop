# Production learning lifecycle

The attached lifecycle is implemented using live Sui state, the current authenticated Tatum GraphQL transport and each user's owned MemWal account. The attachment's names, wallets, balances, checkpoints and memory numbers are illustrative; none are application defaults.

Optional delegated operation is now described in [AUTOPILOT_GUIDE.md](./AUTOPILOT_GUIDE.md). The manual lifecycle below remains available. A consented one-hour browser session can sign payload-bound memory requests; a separate funded on-chain allowance can authorize eligible agent commands and incoming shares. Each owner retains their own MemWal account, and actual confirmed events still control repayment learning. Background recipients require their own live incoming consent. No creator signature authorizes writes or payments for somebody else.

## 1. Connect, resolve and learn

Connecting a Mainnet wallet reads the registry directory, verifies the independent wallet-owned profile, discovers the linked MemWal account and checks ownership, active status and the app delegate. Balances, contacts and checkpoint come from Tatum. Incomplete onboarding remains mandatory for creators and counterparties alike.

Once these checks finish, choose quiet memory or individual approvals before `refresh_learning`. The server verifies the wallet message or its scoped browser-session signature, independently repeats ownership/delegate checks, reads recent confirmed `ShareSettledEvent` records involving that wallet, verifies successful transactions and native-USDC split types, and waits for deduplicated Walrus commits into that wallet's `social_split_trust` namespace. It then recalls all three wallet-scoped namespaces and independently verifies settlement evidence used by the allocation rules.

Safe to Spend stays unavailable until this signed refresh succeeds. An empty memory account succeeds with zero observations; it has no invented rules or required memory count. Cancellation, relayer errors and decryption failures remain visible and require an explicit retry. Background renders never repeatedly open wallet prompts. Wallet changes clear account and memory state.

A refresh checks at most four pages of five contract events. If older history remains, the UI reports this bound and exposes continuation in Memory & preferences. Every continuation requires its own signed request. This is a bounded learned sample, not a claim to index every lifetime event.

## 2. Enter and review a bill

Both Food and Drinks inputs start empty. Typing category amounts derives the total in integer micro-USDC. Choose the actual bill name and participants; blank categories are omitted. Drinks mean alcohol for saved alcohol-sharing exclusions. Other receipt categories and selected-item participants remain available in the guided editor.

Alternatively, Auto-Split sends the user's exact description to `/api/smart-split`, authenticated with the same wallet/action/text/time/nonce/origin signature as memory requests. It resolves names against the current on-chain contact book, refuses unknown or ambiguous contacts, validates receipt conservation, synchronizes real settlement observations and returns the parsed draft plus recalled/verified evidence. It uses explicit receipt syntax rather than guessing financial instructions. No AI key is needed for this parser.

Saved explicit preferences can exclude alcohol items or set a funding threshold/policy. Adaptive escrow uses at least three of the latest five verified qualifying payments. An average delay over seven days suggests escrow; an average within 24 hours restores standard settlement. Manual upfront choices and saved always-upfront rules retain priority. No history means no fabricated trust badge. General notes and extracted facts do not become unreviewed payment instructions.

Fresh learning runs before the final transaction review. There is no memory-off comparison or silent fallback after recall failure. Inspect every share, your included creator share, each exclusion and escrow reason before approving creation.

## 3. Create on Sui

The existing Move builder supplies the owned profile, genuine linked MemWal account, title, exact micro-USDC total, debtor/amount/escrow vectors and clock. Wallet approval precedes submission through the fixed Tatum gateway. The contract creates the shared native-USDC split and emits `SplitCreatedEvent`. Share its real bill link with the participants yourself.

The attachment's rounded example vector is not copied: allocations preserve all six USDC decimals and exactly conserve the total. A reserve setting does not freeze otherwise spendable wallet funds. Only an approved cooldown lock moves funds into a vault.

## 4. Discover, fund, activate and settle

The participant completes their own MemWal/profile onboarding. The app scans real split creation events and reads the current shared objects, or opens a provided bill link. Only the connected wallet's own unpaid share can be paid.

An upfront share first uses **Fund upfront escrow**. Standard shares wait while the bill is pending. After required deposits are funded, the creator activates the bill; this releases those deposits and emits their settlement events. Eligible refunds remain available after cancellation or the funding deadline. Active unpaid standard shares use **Pay Share**, and selected own shares can be batched after review.

Coin reads use pages of at most 50, follow continuation cursors, merge owned native Circle USDC coins and split exact amounts in the transaction. The Move contract checks authorization, amount and current state, transfers funds and emits `ShareSettledEvent`. SUI pays gas. No alternate payment mode exists.

## 5. Commit feedback and improve the next bill

After confirmed settlement or activation, the app requests a signed `settlement` memory action for that digest. The server reads successful exact-package events, checks native-USDC split types and actual creation/settlement timestamps, and waits for `rememberAndWait` to return committed blob references. Those observations appear in the signer's memory feed. An uncertain confirmation or failed memory commit never invites a second payment; confirmation checks and memory-only retry remain separate.

A payer's signature writes only into the payer's account. The creator can import matching received payments into their own account from Memory & preferences. Event IDs deduplicate the import, and verified records inform later allocations. This closes the learning loop without cross-account writes, a database, seed memories or synthetic repayment history. Enough later fast payments can relax adaptive escrow; a single payment never claims an earned trust score.

Purchase check-ins follow the same owned learning model: actual self-reported purchases, server-enforced 48-hour delay, explicit verdict/intensity and committed habit/cash-flow context. The header shield derives from sufficient actual samples and never moves funds automatically. Vault locking still requires amount review and wallet approval for a full 24-hour cooldown.

## Documentation and validation

Walrus documents account/namespace scoping and waiting for committed storage in its [SDK quick start](https://docs.wal.app/walrus-memory/sdk/quick-start), and distinguishes ownership/access metadata from memory content in its [contract overview](https://docs.wal.app/walrus-memory/contract/overview). SolvencyLoop retains its pinned SDK patch and deployed dependency bindings; this update does not migrate the MemWal protocol or redeploy Move contracts.

Automated lifecycle regressions use test-only chain/relayer fixtures to verify creator/payer isolation, deduplication, slow-to-fast escrow evolution, empty accounts, history continuation, failed commits and signed Smart Fill. Browser fixtures cannot sign or submit live transactions. Owner-approved Mainnet acceptance remains a separate user action.
