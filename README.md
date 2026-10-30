# SolvencyLoop

A Next.js 15 App Router application for Sui Mainnet profiles, contact graphs, Circle USDC bill splits, upfront escrow, 24-hour cooldown vaults, and wallet-scoped Walrus memory. There is no application database or local user-state store.

**Current state:** the application runs locally and has automated application/contract tests. Credentials are deliberately blank and the contract has not been deployed. Live Mainnet readiness is a separate check after you complete the steps below.

## Local setup

Requirements: Node.js 22+, npm, and **Sui CLI 1.72.2** for the pinned framework/toolchain. The Move manifest pins the official `mainnet-v1.72.2` source commit and `Move.lock` is checked in. Review both together when upgrading the CLI/framework.

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

1. Configure a **Mainnet** Tatum API key in the ignored `.env.local` file:

   ```dotenv
   TATUM_API_KEY=your_mainnet_tatum_key
   ```

2. Run the checks before publishing:

   ```powershell
   npm.cmd run check
   npm.cmd run move:build
   npm.cmd run move:test
   ```

3. In a second terminal, start the loopback-only Tatum bridge and leave it running:

   ```powershell
   npm.cmd run rpc:bridge
   ```

   The bridge listens on `127.0.0.1:3987` and sends every upstream request to `https://sui-mainnet.gateway.tatum.io` with the server-side `x-api-key` header. It is needed because this Sui CLI does not expose a custom-header option. Do not put your API key in an RPC URL or switch to a public fullnode.

4. In your main terminal, select the bridge-backed environment. Create this alias only once:

   ```powershell
   sui client new-env --alias solvency-tatum-mainnet --rpc http://127.0.0.1:3987
   sui client switch --env solvency-tatum-mainnet
   sui client chain-identifier
   sui client active-address
   sui client gas
   ```

   Confirm the chain identifier is **`35834a8a`**, the Mainnet wallet is yours, and it has SUI for gas. If no wallet is configured, set up/import it yourself using the Sui CLI or your wallet; never place a wallet private key in a public environment variable or this repository.

5. Simulate publication, inspect the result, then publish:

   ```powershell
   sui client publish .\move\solvency_loop --build-env mainnet --dry-run --json
   sui client publish .\move\solvency_loop --build-env mainnet --json
   ```

   The CLI estimates gas when no explicit budget is supplied. Keep dependency verification enabled. The module's `init` function automatically creates and shares one `SolvencyRegistry` during publication.

6. Copy the IDs from the successful publication's `objectChanges`:

   - The entry with `type: "published"` contains `packageId` → `NEXT_PUBLIC_SOLVENCY_PACKAGE_ID`.
   - The created shared object with `objectType: "<packageId>::core::SolvencyRegistry"` contains `objectId` → `NEXT_PUBLIC_SOLVENCY_REGISTRY_ID`.
   - Keep the resulting UpgradeCap under your control.

   Add the two IDs to `.env.local`. You may stop the bridge with Ctrl+C after CLI work finishes. The web app routes directly through its own authenticated Tatum transport/proxy.

## Configure Walrus memory and wallets

Use an existing **Mainnet MemWal account** and an authorized Ed25519 delegate, or provision them using the [official MemWal account documentation](https://github.com/MystenLabs/MemWal). Use the correct deployed MemWal package/registry IDs for that Mainnet relayer; they are different from the SolvencyLoop package/registry.

Fill these values in `.env.local`:

```dotenv
NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=0x...64hex
NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=0x...64hex
MEMWAL_DELEGATE_PRIVATE_KEY=your_authorized_delegate_key
NEXT_PUBLIC_MEMWAL_ACCOUNT_ID=0x...64hex
NEXT_PUBLIC_MEMWAL_AGENT_ID=0x...delegate_public_key_hex
NEXT_PUBLIC_MEMWAL_PACKAGE_ID=0x...64hex
NEXT_PUBLIC_MEMWAL_REGISTRY_ID=0x...64hex
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz
NEXT_PUBLIC_ALEX_SUI_WALLET=0x...real_wallet
NEXT_PUBLIC_PRIYA_SUI_WALLET=0x...real_wallet
NEXT_PUBLIC_SAM_SUI_WALLET=0x...real_wallet
VERIFY_WALLET_ADDRESS=0x...your_connected_wallet
```

The placeholders above are explanatory, not valid values. Wallet/object IDs must be nonzero canonical Sui addresses: `0x` followed by 64 hex digits. `MEMWAL_AGENT_ID` is the delegate's raw 32-byte public key with a `0x` prefix, not its derived Sui wallet address. The readiness script checks that it matches the private delegate key.

Friend wallets can instead be entered in the UI and saved on chain. They must be distinct from each other and the creator. Mainnet USDC is fixed to:

```text
0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
```

The default memory flow uses the relayer and does not need an OpenAI key in the application. The optional manual factory uses server-only `OPENAI_API_KEY` and the delegate. **Do not configure `NEXT_PUBLIC_MEMWAL_DELEGATE_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`.** Those names from the original guide would expose private credentials to the browser.

Both MemWal factories inject the Tatum client. Pinned MemWal 0.1.11 does not natively accept a client in relayer mode; the small, version-checked `scripts/patch-memwal.mjs` postinstall patch adds that injection and disables its public-node fallbacks. Do not use `npm ci --ignore-scripts`. SDK upgrades must review/retest this patch.

## Use and verify the complete flow

1. Restart `npm run dev`, connect your Mainnet wallet, enter your handle, liquidity floor, and the three real friend wallets, then save the profile/contacts. Approve and wait for the Sui transaction.
2. Optionally store the twelve **demo preferences** on Walrus. They are explicitly labelled examples, not fabricated past spending. The app waits for all twelve actual blob commits. Recall your memories with a personal-message signature before applying their rules.
3. Create a bill. Food and eligible drinks are allocated in exact micro-USDC, including the creator's share. Alex's demo rule excludes alcohol; Sam's demo rule requires upfront funding only when his share is **strictly above 40 USDC**. Confirmed settlement timing can also generate an upfront rule when the observed average lag exceeds seven days.
4. A split without upfront shares starts active. A split with upfront shares remains pending: switch to each flagged debtor's wallet and fund its exact share; switch back to the creator to activate. Only then are escrow funds released to the creator and standard settlement enabled.
5. A creator can cancel a pending split. Funded participants can refund after cancellation, or independently after the 24-hour funding deadline. Cancelled/expired splits cannot activate. Settlements reject underpayment, overpayment, and duplicate payment.
6. After a successful settlement/activation, the app verifies package-emitted on-chain events before storing actual timing observations in the payer and recipient namespaces. A memory failure does not reclassify a confirmed payment as failed: use the memory-only retry button instead of paying twice.
7. A registered wallet can lock USDC for exactly 24 hours. The builder selects sufficient real USDC coins across pages. The contract consumes and transfers a reserve coin back to the owner, enforcing the registered floor on chain. The owner can unlock only after maturity. The vault cannot be transferred to another wallet.
8. Record a reflection, analyze notes into facts, recall memories, or restore a namespace's index. These operations require short-lived signatures over the exact action/payload and web origin. Restore reports partial recovery or permanent errors honestly.

Run the read-only readiness check once the profile exists and at least ten unique memories are recallable:

```powershell
npm.cmd run verify:mainnet
```

It fails unless it verifies authenticated Mainnet chain/checkpoint access, the shared registry's exact type, required published functions, Circle USDC metadata, delegate identity, matching relayer Mainnet configuration, relayer health, and at least ten distinct readable Walrus blobs across the verification wallet's three namespaces. It does not seed data or submit a transaction.

## Validation and production

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run move:build
npm.cmd run move:test
npm.cmd run build
npm.cmd start
```

Use a single running dev/build/start process per checkout; stop the development server before rebuilding production output. Both dev and production servers bind to loopback locally. A hosted deployment should supply private environment variables through its host's secret settings, set APP_ORIGIN to its public HTTPS origin behind a reverse proxy, and rebuild after changing public configuration. Memory seeding can wait for up to twelve relayer commits; the memory route allows up to 600 seconds. Use a host supporting that duration, or commit/recall individual memories instead.

Local automated validation covers signature tampering/expiry/origin isolation, RPC routing, exact amounts, rule application, memory commit/error handling, and Move scenarios for funding, cancellation/refunds, unauthorized actions, payment validation, and cooldown/floor enforcement. Live wallet signatures, Mainnet contract execution, and real relayer writes require your post-deployment validation and are not claimed to have run locally.

The original [LOCAL_VERIFICATION.md](./LOCAL_VERIFICATION.md) is a historical baseline of the unmodified repository, not the status of this implementation.

References: [Next.js 15 App Router](https://nextjs.org/docs/15/app/getting-started/installation), [Tatum Sui gateway](https://tatum.io/chain/sui), [Sui package management](https://docs.sui.io/develop/manage-packages), [MemWal SDK](https://github.com/MystenLabs/MemWal).
