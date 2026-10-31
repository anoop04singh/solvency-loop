# SolvencyLoop

A Next.js 15 App Router application for Sui Mainnet profiles, contact graphs, Circle USDC bill splits, upfront escrow, 24-hour cooldown vaults, and user-owned MemWal accounts with wallet-scoped Walrus memory. There is no application database or local user-state store.

**Current state:** the object-factory contract is published on Sui Mainnet (see `move/solvency_loop/Published.toml`). The application provides wallet-owned onboarding, personal contacts, real USDC expenses, payment history, cooldown savings and user-authored memory. No sample contacts, preset bills or memory-seeding action are enabled. See `PRODUCTION_READINESS.md` for verification evidence and remaining wallet-approved checks.

The public landing page at `/` explains the application with original SVG illustrations and Framer Motion interactions. Choose **Open app** to enter `/app`. Existing `/?split=...` bill links redirect to the workspace; new links use `/app?split=...`. Wallet providers are scoped to the workspace so browsing the landing page does not initialize wallet or chain requests.

The workspace uses locally bundled Vanta Fog with outcome colors: green for completed actions, yellow for processing/pending confirmation and red for errors or stale account state. It reads the existing operation state and never confirms or authorizes payments. Pause the background using its status pill. Reduced-motion/data-saver preferences, unavailable WebGL and context loss use a static palette; hidden tabs release their renderer. See the [Vanta lifecycle documentation](https://github.com/tengbao/vanta#cleanup) and [Motion accessibility guidance](https://motion.dev/docs/react-accessibility). Presentation styles are local overrides; generated Tatum tokens remain untouched.

**Access policy:** a wallet-owned MemWal account is mandatory. Users create or reuse that account, authorize the app delegate, then register their profile before the financial dashboard opens. The contract accepts an actual MemWalAccount object and checks its owner and profile link for financial actions. Payments and vaults use only native Circle USDC on Sui Mainnet. SUI is needed for network gas. There is no guest payment, off-chain settlement, card/fiat payment, alternative token, or MemWal-free payment path. Existing-fund recovery still requires the user's genuine linked MemWal account, but works after memory revocation/freezing to avoid trapping funds.

## Object factory structure

One published Move package creates independent objects using shared application code. Users do not deploy individual packages.

| Object | Ownership and purpose |
| --- | --- |
| `SolvencyRegistry` | Shared directory of wallet address → profile object ID, plus registered-user count. Only first registration writes it. |
| `UserProfile` | One non-transferable, wallet-owned object containing the handle, MemWal account link, liquidity floor, contacts and registration timestamp. |
| `MemWalAccount` | The user's existing account in the separate MemWal protocol. Ownership and the registered profile link are checked for every financial action. |
| `GroupSplitEscrow<USDC>` | Independent shared object per bill, so its participants can fund and settle it. |
| `CooldownVault<USDC>` | Independent owner-held object per deposit, with an enforced 24-hour unlock time. |

`register_user` is the profile factory: it verifies the genuine active MemWal account, rejects duplicate registration, creates the profile with optional initial contacts, records its ID in the directory and transfers it to the caller atomically. `update_profile`, contact edits and every financial function receive that owned profile directly; the global registry is not a transaction input for those operations. The profile has only the `key` ability, no public transfer function and an immutable wallet field. Only the factory can construct a profile.

The browser and memory API discover the ID through the directory, then verify the profile's exact type, address ownership, UID and recorded wallet. Lookup errors and legacy nested-profile entries block actions; only an explicit missing directory entry enables registration. Profile IDs are discovered per user and need no additional environment variables. On-chain profiles, contacts and financial records remain public.

This removes shared-registry writes from profile/contact edits. Registration still shares a directory write, and participants updating the same bill still share that bill's object. MemWal and bill transactions still involve shared objects; this is not a promise of consensus-free payments or measured gas savings.

The current deployment uses this object layout. For a new deployment, publish the package using the steps below and configure its package/registry IDs together. An older package containing nested profiles is not compatible with these builders; upgrading an already deployed older layout would require a separate migration plan.

## Local setup

Requirements: Node.js 22+, npm, and **Sui CLI 1.72.2** for the pinned framework/toolchain. The Move manifest pins the official `mainnet-v1.72.2` source commit and `Move.lock` is checked in. Review both together when upgrading the CLI/framework.

The Move package also depends on the existing Mainnet MemWal contract. Its official production source is pinned in `move/vendor/memwal` with its license and provenance. Only test-only fixtures are added; this protocol package is not republished with SolvencyLoop. The root manifest uses the current package format with explicit pinned `std`/`sui` dependencies. The vendor's `Published.toml` supplies the existing Mainnet address; legacy `[addresses]` tables are intentionally absent. [CONTRACT_VERIFICATION.md](./CONTRACT_VERIFICATION.md) records the contract/application checks and their limits.

From this folder in PowerShell:

```powershell
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The setup screen and wallet chooser work before deployment; financial actions remain disabled until the required configuration is present. Restart the server after changing environment variables, especially `NEXT_PUBLIC_*` values.

The active server is Next.js. The original Vite/Express preview server and mock API have been removed.

The lockfile also applies compatible security overrides for PostCSS, nanoid, and source-map-js, including Next.js's nested PostCSS dependency. Keep these overrides when updating dependencies and rerun the production advisory check.

## Deploy the Move contract to Sui Mainnet

These commands are for you to execute. Publishing spends SUI gas. No deployment or signed transaction has been performed by the coding agent.

1. Open PowerShell in the project and confirm your installed Sui CLI matches the pinned **1.72.2** baseline:

   ```powershell
   Set-Location "C:\Users\singa\OneDrive\Documents\ChatGPT\solvency-loop"
   sui --version
   ```

   Deployment uses the Sui CLI directly against Sui's [official Mainnet endpoint](https://docs.sui.io/develop/sui-architecture/networks). No Tatum bridge or Tatum API key is required for these CLI steps. The application's own RPC transport still requires its Tatum key later.

2. Run the checks before publishing. Stop any Next.js development server before `npm.cmd run check`, because it includes a production build:

   ```powershell
   npm.cmd run check
   npm.cmd run move:build
   npm.cmd run move:test
   npm.cmd run move:verify-bundle
   ```

3. Configure a direct Mainnet CLI environment. Run `new-env` only once; if the alias already exists, confirm its URL with `sui client envs` and reuse it:

   ```powershell
   sui client envs
   sui client new-env --alias solvency-direct-mainnet --rpc https://fullnode.mainnet.sui.io:443
   sui client switch --env solvency-direct-mainnet
   ```

4. Check the network, wallet and available SUI gas:

   ```powershell
   sui client chain-identifier
   sui client active-address
   sui client gas
   ```

   Confirm the chain identifier is **`35834a8a`**, the Mainnet wallet is yours, and it has SUI for gas. Use `sui client addresses` to list configured wallets and `sui client switch --address YOUR_DEPLOYER_ADDRESS` if you need to select another one. If no wallet is configured, set up/import it yourself using the Sui CLI or your wallet; never place a wallet private key in a public environment variable or this repository. This package links to existing Mainnet MemWal objects and must be published to Mainnet with these dependency bindings.

5. Verify the dependency source with the direct Mainnet CLI, then simulate publication. Run these commands individually, and only continue to the publish command after verification and the dry run succeed:

   ```powershell
   sui client verify-source .\move\solvency_loop --build-env mainnet --verify-deps --skip-source
   sui client publish .\move\solvency_loop --build-env mainnet --verify-deps --dry-run --json
   sui client publish .\move\solvency_loop --build-env mainnet --verify-deps --json
   ```

   The first command verifies on-chain dependencies while skipping the unpublished root package. The CLI estimates gas when no explicit budget is supplied. Keep dependency verification enabled; if a source/dependency mismatch is reported, stop and review the pinned dependency instead of skipping verification. Do not use `--with-unpublished-dependencies`: MemWal is already deployed. The module's `init` function automatically creates and shares one `SolvencyRegistry` during publication. The coding agent has checked the installed CLI's flags but has not executed these Mainnet verification/publication commands or signed a transaction.

6. Copy the IDs from the successful publication's `objectChanges`:

   - The entry with `type: "published"` contains `packageId` → `NEXT_PUBLIC_SOLVENCY_PACKAGE_ID`.
   - The created shared object with `objectType: "<packageId>::core::SolvencyRegistry"` contains `objectId` → `NEXT_PUBLIC_SOLVENCY_REGISTRY_ID`.
   - Keep the resulting UpgradeCap under your control.

   Add the two IDs to `.env.local`. The CLI also writes publication metadata to `Published.toml`; retain it with the lockfile. After publication, verify the root package with `sui client verify-source .\move\solvency_loop --build-env mainnet --verify-deps`. Complete the app's Tatum/MemWal environment configuration below and restart it. The web app continues to route through its own authenticated Tatum transport/proxy, independently of your CLI environment. The unused `rpc:bridge` helper is optional legacy tooling and is not part of this deployment procedure.

## Configure Walrus memory and wallets

Configure the deployed **Mainnet MemWal protocol package/registry** and an app server Ed25519 delegate using the [official MemWal account documentation](https://docs.wal.app/walrus-memory/contract/delegate-key-management). These package/registry IDs are shared protocol infrastructure, different from SolvencyLoop's package/registry. Every connected wallet discovers its own account through the MemWal registry's owner-to-account table; account IDs are stored in each user's SolvencyLoop profile on Sui, never in a global environment setting.

Fill these values in `.env.local`:

```dotenv
NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=0x...64hex
NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=0x...64hex
MEMWAL_DELEGATE_PRIVATE_KEY=your_app_server_delegate_key
NEXT_PUBLIC_MEMWAL_AGENT_ID=0x...delegate_public_key_hex
NEXT_PUBLIC_MEMWAL_PACKAGE_ID=0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5
NEXT_PUBLIC_MEMWAL_REGISTRY_ID=0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz
VERIFY_WALLET_ADDRESS=0x...your_connected_wallet
```

The MemWal package/registry IDs above were read from the [public Mainnet relayer configuration](https://relayer.memory.walrus.xyz/config) on 2026-10-30 and match the [official app configuration](https://github.com/MystenLabs/walrus-memory/blob/bbf6b2268f1985bbafbb9f2aab16436fc30da7da/apps/app/.env.example). They are real protocol IDs. Other `0x...` values remain explanatory placeholders: replace them with your deployment output or real wallet addresses. Wallet/object IDs must be nonzero canonical Sui addresses: `0x` followed by 64 hex digits. `NEXT_PUBLIC_MEMWAL_AGENT_ID` is the app delegate's raw 32-byte public key with a `0x` prefix, not its derived Sui wallet address. The setup API and readiness script check that it matches the private delegate key. Generate a separate app delegate using the official `generateDelegateKey()` helper; keep its private key only in server secrets. Users authorize that public key themselves through their wallets. It is never a user's owner-wallet private key.

Before deployment you can confirm the public protocol IDs without credentials:

```powershell
Invoke-RestMethod https://relayer.memory.walrus.xyz/config | Select-Object network, packageId, registryId
```

Use only the protocol IDs from that response. Application traffic stays on the authenticated Tatum gateway; manual Sui CLI deployment and source verification use direct Sui Mainnet. Do not copy alternative RPC URLs into the application. If the protocol package changes, review the vendored contract, Mainnet dependency binding, SDK compatibility and environment together before deployment.

Environment checklist:

| Variable | What you supply | When |
| --- | --- | --- |
| `TATUM_API_KEY` | Your Tatum key enabled for the Sui Mainnet gateway | Before starting the app |
| `MEMWAL_DELEGATE_PRIVATE_KEY` | App delegate private key generated below | Before starting the app |
| `NEXT_PUBLIC_MEMWAL_AGENT_ID` | Matching raw public key generated below | Before starting the app |
| `NEXT_PUBLIC_MEMWAL_PACKAGE_ID`, `NEXT_PUBLIC_MEMWAL_REGISTRY_ID` | Verified public protocol IDs shown above | Before starting the app |
| `NEXT_PUBLIC_SOLVENCY_PACKAGE_ID`, `NEXT_PUBLIC_SOLVENCY_REGISTRY_ID` | Values from your successful publish transaction | After deployment |
| `APP_ORIGIN` | Leave blank locally; set the public HTTPS origin on a host | For hosted deployment |
| `VERIFY_WALLET_ADDRESS` | An onboarded wallet; an empty memory account is valid | Before `verify:mainnet` only |
| `OPENAI_API_KEY` | Not needed for the default relayer flow; server-only manual mode credential | Optional |

No user wallet private key, personal MemWal account ID, database URL, or payment-provider key belongs in this setup. The RPC URL is fixed in code; the old `NEXT_PUBLIC_TATUM_SUI_RPC` setting is ignored.

To generate the app delegate once, run this locally and copy the two resulting lines into the ignored `.env.local` (or your host's secret settings). No chain transaction is submitted by this command:

```powershell
node --input-type=module -e "import { generateDelegateKey } from '@mysten-incubation/memwal/account'; const k = await generateDelegateKey(); console.log('MEMWAL_DELEGATE_PRIVATE_KEY=' + k.privateKey); console.log('NEXT_PUBLIC_MEMWAL_AGENT_ID=0x' + Buffer.from(k.publicKey).toString('hex'));"
```

Keep this delegate stable across restarts. Rotating it later requires each user to approve the new public key and revoke the old one in their MemWal account.

Remove the obsolete `NEXT_PUBLIC_MEMWAL_ACCOUNT_ID` from existing environment files. It is no longer read. No per-user credentials or account IDs need to be added to `.env.local`. The same backend delegate can be approved by multiple account owners, but the backend still has account-wide access while approved. User-owned accounts provide ownership and revocation control; they do not make the backend unable to read authorized memories. Namespaces organize data inside an account and are not separate access boundaries. See [MemWal ownership and permissions](https://docs.wal.app/walrus-memory/contract/ownership-and-permissions).

Contacts are entered by each user in Account and saved on chain. Bill participants can be chosen from those contacts or entered directly. Wallets must be distinct from each other and the creator. The previous named-contact environment defaults are no longer read. Mainnet USDC is fixed to:

```text
0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
```

The default memory flow uses the relayer and does not need an OpenAI key in the application. The optional manual factory uses server-only `OPENAI_API_KEY` and the delegate. **Do not configure `NEXT_PUBLIC_MEMWAL_DELEGATE_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`.** Those names from the original guide would expose private credentials to the browser.

Both MemWal factories inject the Tatum client. Pinned MemWal 0.1.11 does not natively accept a client in relayer mode; the small, version-checked `scripts/patch-memwal.mjs` postinstall patch adds that injection and disables its public-node fallbacks. Do not use `npm ci --ignore-scripts`. SDK upgrades must review/retest this patch.

## Use and verify the application

Follow [USER_GUIDE.md](./USER_GUIDE.md) for real onboarding, personal contacts, expenses, memory and savings. The demo seeding action and named-contact defaults have been removed. No stored memories are required to complete onboarding.

The application uses the supported GraphQL path on the fixed Tatum Mainnet gateway. Browser requests still use /api/tatum-rpc. See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for the reproduced 404 cause, request pacing, Retry-After handling and verification evidence.

Run npm.cmd run verify:infrastructure before onboarding to check the live deployment and relayer without signing or writing. After onboarding, set VERIFY_WALLET_ADDRESS and run npm.cmd run verify:mainnet to check ownership and memory access. An empty memory account is valid.

## Validation and production

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run move:build
npm.cmd run move:test
npm.cmd run move:verify-bundle
npm.cmd run build
npm.cmd start
```

For browser regression checks, leave a local preview running and run `npm.cmd run test:ui` in another terminal. The suite uses the installed Google Chrome in headless mode and covers the landing interactions, mobile widths, legacy bill links, mandatory onboarding, drawer, Vanta cleanup/context loss and reduced motion. `PLAYWRIGHT_BASE_URL` optionally selects another local preview URL. It does not connect a wallet, sign or submit transactions.

Use a single running dev/build/start process per checkout; stop the development server before rebuilding production output. Both dev and production servers bind to loopback locally. A hosted deployment should supply private environment variables through its host's secret settings, set APP_ORIGIN to its public HTTPS origin behind a reverse proxy, and rebuild after changing public configuration. Memory operations may wait for relayer commits; the memory route allows up to 600 seconds. Use a host supporting the required duration.

Local automated validation covers signature tampering/expiry/origin isolation, RPC routing, exact amounts, rule application, memory commit/error handling, and Move scenarios for funding, cancellation/refunds, unauthorized actions, payment validation, and cooldown/floor enforcement. Live wallet signatures, Mainnet contract execution, and real relayer writes require your post-deployment validation and are not claimed to have run locally.

The original [LOCAL_VERIFICATION.md](./LOCAL_VERIFICATION.md) is a historical baseline of the unmodified repository, not the status of this implementation.

References: [Next.js 15 App Router](https://nextjs.org/docs/15/app/getting-started/installation), [Tatum Sui gateway](https://tatum.io/chain/sui), [Sui package management](https://docs.sui.io/develop/manage-packages), [MemWal SDK](https://github.com/MystenLabs/MemWal).
