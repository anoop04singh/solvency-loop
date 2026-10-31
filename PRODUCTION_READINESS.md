# Verification record

Updated 2026-10-31. These checks distinguish local validation, live read-only checks and actions that still require the owner's wallet. They are not an external security audit.

## Consumer interface

The supplied design guide is used as a visual reference: warm alabaster canvas, centered stages, white cards with stone borders, generous spacing, bold balances, pill navigation and a glass account/proof drawer. Expense sharing retains the existing equal/custom calculation and preference controls. The drawer displays already-loaded wallet, checkpoint, MemWal, memory and activity data without requesting signatures or making writes. Animations respect `prefers-reduced-motion`.

The guide's example users, amounts, memory counts and replacement transaction handlers were not incorporated. Account ownership, mandatory MemWal onboarding, native USDC payments, confirmations, recovery and financial calculations retain their existing implementation. No contract redeployment is needed for this visual update.

The public landing page now lives at `/`, with the existing workspace at `/app`. Older `/?split=` URLs redirect while preserving the bill ID, and newly copied links use `/app?split=`. Wallet providers mount only inside the workspace. Original SVG artwork illustrates expense shares, the actual 24-hour cooldown and personal memory without fabricating accounts, balances or financial history. Framer Motion provides parallax, magnetic links, shared-layout feature selection, reveal and SVG animation. The server and initial browser render agree before enabling motion.

Vanta Fog subscribes to application feedback: green for completed actions, yellow for work/pending confirmation and red for errors or stale account state. An unresolved payment confirmation or memory update overrides an earlier success. The effect cannot authorize or confirm transactions. It is locally bundled, loaded only in the workspace, paused by a user control, released on hidden tabs/unmount, and replaced by a static palette for reduced motion, data saver or WebGL failure/context loss. Renderer, scene, canvas and listeners are cleaned up.

TypeScript, lint and all 41 application tests passed after this update. The production build passed, with the landing page reporting 169 kB first-load JavaScript and the workspace 364 kB; WebGL imports load separately. Seven headless Chrome browser checks passed against both the development preview and final production build: interactive feature explanations/FAQ, no landing chain requests, mandatory onboarding, old bill-link routing, narrow layouts, error feedback, proof drawer/Escape, Vanta pause/resume/context loss/unmount, reduced motion and readable no-JavaScript content. Screenshots were reviewed at desktop and mobile sizes, and the corrected landing page produced no console errors. Final production HTTP checks passed home/workspace/config, five concurrent authenticated checkpoint reads, legacy JSON-RPC rejection and unsigned/missing-origin memory rejection.

The earlier visual review was interrupted by Escape. The automated browser checks above complete that first-visit review without taking control of the user's desktop. Wallet-connected financial screens and owner-approved Mainnet actions still require the operator's acceptance check. Earlier production HTTP checks also passed home/config, five concurrent authenticated checkpoint reads, rejection of legacy JSON-RPC and unsigned/missing-origin memory requests.

## Tatum transport

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

1. Review the new landing and workspace with your preferred devices and wallet extension. Automated first-visit layout/drawer/motion checks have passed; wallet-connected financial screens remain an owner check.
2. Connect a real wallet with SUI for gas; create or discover its personal MemWal account, review delegate access and register the profile.
3. Run `npm.cmd run verify:mainnet` with that wallet configured. An empty memory account is valid.
4. Save and recall a real note/preference. Review a real bill's shares before authorizing any payment. Separately validate escrow activation/refund, settlement and matured-vault withdrawal with the relevant owners.

No wallet signature, delegate grant, memory write, deployment or live financial transaction was performed by the coding agent. The preview is local; public hosting was not deployed. See [USER_GUIDE.md](./USER_GUIDE.md) for the application flows and [CONTRACT_VERIFICATION.md](./CONTRACT_VERIFICATION.md) for contract invariants.
