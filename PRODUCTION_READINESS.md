# Verification record

Updated 2026-11-01. These checks distinguish local validation, live read-only checks and actions that still require the owner's wallet. They are not an external security audit.

## Consumer interface

The workspace now implements all three supplied Swiss editorial exports: the full Split a Bill card, Regret Check-In with cooldown protection, and Settle Shares with the right-side contact/memory drawer. It uses the reference's warm canvas, 896px header/footer, 672px workspace, locally bundled Hanken Grotesk, white cards, inset objects and compact contextual actions. The public landing design is unchanged. The mandatory wallet/MemWal onboarding gate remains intact.

Food/Drinks inputs start empty and derive their total in micro-USDC. Authenticated Auto-Split accepts explicit six-decimal amounts, receipt categories and actual contacts resolved from the current on-chain profile. It rejects unknown/ambiguous names and nonconserving receipts, synchronizes confirmed payments and returns fresh owned learning with the draft. Preset bills, comparison mode and preselected financial form choices are removed. Guided dialogs retain one-input steps, exact share review and keyboard access. Contact edits stay staged until a reviewed wallet save. Ratings, rule badges, checkpoints and memory counts come from loaded state; reference-only prediction, zero-gas, seed-memory or ZK claims are not application guarantees.

Both routes retain locally bundled Vanta Fog, with much subtler fog over the workspace's editorial canvas. Green/yellow/red accents follow completed, pending and attention states. Errors and unresolved confirmations override an earlier success. Pause, hidden-tab cleanup, reduced-motion/data-saver behavior and the static WebGL fallback remain supported. Loading follows actual pending work with an animated orbit, indeterminate track and quiet skeletons; it never invents a completion percentage or treats animation as transaction confirmation.

The public landing remains at `/`; the gated workspace remains at `/app`. Old `/?split=` links still return an HTTP redirect preserving the bill ID. The landing remains readable and actionable without JavaScript. Wallet providers remain scoped to the workspace.

Application validation covers strict bill parsing, exact allocations, batch ownership/state/combined-balance checks, creator/payer account isolation, slow-to-fast escrow evolution, empty histories, bounded continuation, missing commits and signed Smart Fill. Browser validation covers the real first-visit routes and isolated wallet-connected components, including blank forms, direct receipt input, one automatic learning refresh per ready wallet, explicit retries, contacts, nested scroll locks, draft preservation, selected batches and vault review. Settled desktop/mobile screenshots are captured for the empty workspace, populated bill, regret/vault and settlement/proof drawer. Landing/shared presentation file hashes match their pre-update baseline. The production build reports 177 kB landing and 414 kB workspace first-load JavaScript; WebGL imports load separately.

Validation passes type checking, lint, **75 application tests**, **27 headless Chrome checks** and the production build. The Smart Fill route returns 401 for unsigned same-origin requests and 403 for cross-origin requests. The visual pass includes empty inputs and all three mobile workspace screens. No live wallet signature or financial transaction was submitted.

Form visual tests bundle the real components with test-only fixtures using esbuild and Playwright request interception. They create no application route, cannot sign or submit transactions, and fixture markers were confirmed absent from production browser bundles. There were no runtime dependency version upgrades when adding the direct development-only bundler dependency.

Batch settlement composes the existing deployed `settle_split_share` function for 1–20 distinct selected own bills in one atomic transaction. Coin pagination remains capped at 50. Move source, payment arithmetic, wallet execution through Tatum, mandatory account access and payload-bound signatures are preserved. The new `/api/smart-split` route shares the same signature/origin verification as `/api/memory`; incomplete learning responses cannot become empty success. No contract redeployment is required. Real owner-approved Mainnet acceptance remains separate from isolated browser tests. No signature, memory write or live financial transaction was performed by the coding agent for this update.

### Session and settlement learning

After owned onboarding, `useLearningSession` requests one signed `refresh_learning` action. The server checks current ownership/delegate access, synchronizes up to 20 recent contract settlement events into that wallet's own namespace, waits for deduplicated committed blobs and recalls all three namespaces. It returns continuation for older history and independently checks settlement evidence before use. Safe to Spend remains unavailable until this succeeds; failed/canceled requests require an explicit retry. Fresh learning is required again before final bill review. No memory-off fallback is offered.

After confirmed payment or activation, a signed settlement action records the signer's actual events and returns committed references for the feed. The learning digest survives uncertain confirmation; checking a successful confirmation resumes the memory update. The creator's next signed session/review imports payments received into the creator's own account. A payer never writes to the creator using the payer's authorization. Existing event deduplication makes memory-only retry safe. See [LIFECYCLE.md](./LIFECYCLE.md) for the full mapping, including the attachment's retired RPC names, rounded example vector and required upfront-funding/activation correction.

## Tatum transport

### Settlement preparation pagination

The missing wallet approval prompt was reproduced before signing: the payment builder requested 100 native-USDC coin objects, while the authenticated Tatum GraphQL Address.objects connection reported maxPageSize 50 and defaultPageSize 20. The gateway returned the exact error "Page size is too large: 100 > 50", so execution never reached the wallet.

Payment builders now request at most 50 coins per page and keep reading opaque continuation cursors until the required amount and reserve are covered. The compatibility client's Core pagination guard also caps coin, balance, owned-object, event and transaction pages, preserving smaller limits and filters. Legacy event cursors are mapped to the SDK's before/after bounds. No signed transaction retries or public-node fallback were added.

Read-only live verification confirmed the same oversized coin request now returns a valid 50-item page and continues to a second page with an advancing cursor. Tests exercise the real SDK against a strict test gateway and construct settlement/upfront transactions needing a 51st coin. Provider errors now appear inside the review card. The configured operator verification wallet was absent, so a real user's unsigned payment build and wallet approval were not claimed; no signing or submission was performed.

The old authenticated `https://sui-mainnet.gateway.tatum.io` JSON-RPC root returned HTTP 404 in paced live probes. The same gateway's advertised methods identified `/graphql`; authenticated reads there succeeded. Application traffic now uses that supported path, with the official Sui GraphQL Core API and a compatibility facade for the pinned wallet/MemWal consumers. Browser requests retain `/api/tatum-rpc`; no public-node fallback is enabled.

The transport coalesces identical in-flight reads, spaces upstream starts by at least 400 ms and respects `Retry-After` when retrying rate-limited reads. Signed execution mutations are never automatically retried. Five simultaneous identical production-proxy checkpoint reads all returned HTTP 200. A low Tatum account quota can still produce an explicit rate-limit error; pacing does not create additional quota.

Tatum's documentation MCP was consulted for the legacy Sui endpoint, migration guidance and rate-limit behavior. The actual gateway response and successful authenticated reads established the supported endpoint for this installation.

## Existing contract and onboarding validation

### Delegate decoding correction

The permission-step error `Malformed MemWal delegate key` was reproduced against the public account supplied in the user's screenshot. Its genuine active account already contained the app's matching 32-byte Ed25519 delegate and matching derived Sui address. GraphQL returned `public_key: vector<u8>` as a canonical Base64 string; the application reader incorrectly accepted only the old numeric-array representation. This was an application decoding error, not an invalid configured key or failed authorization transaction. The [Sui MoveValue JSON specification](https://docs.sui.io/references/sui-api/sui-graphql/beta/reference/types/objects/move-value) documents Base64 byte vectors.

The shared account reader now decodes canonical Base64 and still accepts valid numeric arrays. It requires exactly 32 bytes, rejects invalid encoding/padding/length/value ranges, and retains the expected public-key/address match and live ownership/type/active/link checks. Existing authorization is reused, so the app refuses duplicate grant construction. Two regression tests exercise real GraphQL-shaped account data, duplicate-grant prevention, legacy arrays, malformed encodings, foreign keys/addresses and foreign owners. All 43 application tests pass.

Live read-only checks now pass account discovery, delegate authorization and the next profile read for the affected wallet. Its profile has not yet been registered and its SUI gas balance is positive. The owner can refresh the rebuilt workspace and continue with **Your profile**. No key rotation, environment edit, contract deployment or new authorization transaction is required for this fix.

### Earlier infrastructure checks

The user's published factory package and shared registry are recorded in `move/solvency_loop/Published.toml`. Live read-only infrastructure validation passed Mainnet identification, registry ownership/type, all 12 entry-point argument shapes, profile fields/abilities, native Circle USDC metadata, delegate key matching and MemWal relayer configuration/health. An unsigned MemWal account-creation transaction was built and simulated; it was not signed or submitted.

Earlier validation of the current contract passed production Move compilation and all 31 Move tests. The visual update does not modify Move source, application transport, memory authentication or payment builders.

The configured verification wallet had no registered profile or MemWal account when checked. Completing environment configuration does not create those owned objects. Each user must complete onboarding through their own wallet.

## Remaining owner-approved acceptance checks

### Guided workspace and behavioral features

The app-only design update adds a real balance/allocation overview and step dialogs for expenses, preferences, notes, profile/contacts, purchases and vault protection. All original landing source and shared presentation files are preserved. No runtime fixture data, new database, financial token or guest-use path was introduced.

Social splits now allocate exact receipt amounts with saved alcohol exclusions and reviewed adaptive escrow flags. Qualifying settlement history is reverified from successful exact-package events and native Circle USDC split objects on Tatum before use. Confirmed settlement learning retains its owner-only writes and event deduplication. Regret check-ins enforce 48 hours server-side, write both habit and live cash-flow context, and drive the documented, bounded spending-room/shield formula. Purchase metadata is self-reported; settlement evidence is chain verified. Recommendations never sign, pay or lock funds.

Application tests cover exact allocations, rule priority/relaxation, owner isolation, signed payload fields, purchase age, two-namespace commit failures, evidence verification and quota conservation. Browser tests use intercepted isolated fixtures for the wallet-connected forms; production first-visit tests cover the real landing and onboarding gate. Full owner-signed Mainnet acceptance remains separate. Move source, published interfaces and transaction builders are unchanged by these features.

1. Review the new landing and workspace with your preferred devices and wallet extension. Automated first-visit layout/drawer/motion checks have passed; wallet-connected financial screens remain an owner check.
2. Connect a real wallet with SUI for gas; create or discover its personal MemWal account, review delegate access and register the profile.
3. Run `npm.cmd run verify:mainnet` with that wallet configured. An empty memory account is valid.
4. Save and recall a real note/preference. Review a real bill's shares before authorizing any payment. Separately validate escrow activation/refund, settlement and matured-vault withdrawal with the relevant owners.

No wallet signature, delegate grant, memory write, deployment or live financial transaction was performed by the coding agent. The preview is local; public hosting was not deployed. See [USER_GUIDE.md](./USER_GUIDE.md) for the application flows and [CONTRACT_VERIFICATION.md](./CONTRACT_VERIFICATION.md) for contract invariants.
