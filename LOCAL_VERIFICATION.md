> Historical baseline before repairs. See README.md for the current application and deployment steps.

# SolvencyLoop local setup and verification

Date: 29 October 2026 (Asia/Calcutta)

Repository: https://github.com/anoop04singh/solvency-loop  
Branch: `main`, tracking `origin/main`  
Verified commit: `1e1e29a42c4b31da695bfb8d73e683b6e80b5bf3`  
Local folder: `C:\Users\singa\OneDrive\Documents\ChatGPT\solvency-loop`

**Result: the repository is installed locally, but the requested application has not been implemented correctly end to end.** TypeScript and the Vite production build pass. The development page crashes, the Move contract does not compile, and the active memory API is a mock. Mainnet deployment and storage remain unverified.

Scope: setup and verification only. No existing application source, manifests, lockfiles, or contracts were edited. No commits, pushes, deployments, wallet signatures, financial transactions, or real memory writes were performed. This report is the only added, non-ignored repository file; dependencies and inspection artifacts are ignored local files.

## Local setup

- Fetched the repository into the previously empty Git repository in the requested folder and checked out `main`.
- Installed the existing lockfile with `npm.cmd ci --no-audit --no-fund`: **334 packages installed**, exit code 0.
- Versions available locally: Node `v22.16.0`, npm `11.11.0`, Sui CLI `1.72.2-85b460a63fd7-dirty`.
- `npm.cmd run dev` starts the existing Express/Vite server on port 3000. The HTML shell responds at `http://localhost:3000/`, but the React application currently fails to render.
- No `.env.example` or `.env.local` was present. None of the 15 environment variables requested in Part 1.3 was present in the shell. No credentials, deployment IDs, or friend addresses were invented or added.

To start the current code from this folder:

```powershell
npm.cmd run dev
```

This starts the server; it does not resolve the browser error described below.

## Verification by instruction section

| Requested section | Result | Evidence |
| --- | --- | --- |
| Part 1: Next.js 15 App Router, TypeScript, Tailwind | **Does not match** | TypeScript and Tailwind are configured, but the active runtime is React/Vite/Express. Installed Next.js is 16.4.3 and is not the application server. |
| 1.1: exact target tree | **Partial** | 18 of the 20 listed files exist. `src/app/globals.css` and `.env.example` are missing; active styles are in `src/index.css`. `.env.local`, separately required by 1.3, is also absent. |
| 1.2: dependencies and compatible peers | **Partial** | Locked dependencies install and `npm ls --all` passes. Several explicitly requested packages are missing or only transitive; see the version table below. |
| 1.3: environment configuration | **Missing locally** | All 15 requested variables are absent. The active server also does not load `.env.local`; frontend `NEXT_PUBLIC_*` values are not wired into Vite. |
| Part 2: Move state layer | **Source present; compilation fails** | Manifest and contract exist. Contract text matches the supplied reference after normalizing line endings and surrounding whitespace, but compilation fails with E07002 at line 221. |
| Part 3: Tatum, memory, and on-chain libraries | **Partial** | All three modules exist; transaction builders construct the expected commands offline. Application configuration fails in the browser, and actual chain/memory integration is unverified. |
| Part 4: backend APIs | **Tatum partial; memory fails** | Active Express Tatum proxy is wired. The complete-looking Next.js memory route is not mounted; Express serves hardcoded reads and fabricated write acknowledgements instead. |
| Part 5: providers, five panels, dashboard | **Present but not operational** | Providers, panels, handlers, and dashboard exist. The browser crashes before showing the dashboard. Escrow threshold and liquidity floor behavior also have implementation gaps. |
| Part 6: automated mainnet verification | **Fails its purpose** | The script prints claims and returns `true`; it checks no checkpoint, registry, relayer, or recalled memory count. |

## Architectural rules

| Rule | Assessment |
| --- | --- |
| Zero database | **Pass on source inspection:** no configured database or local durable user-state store was found in application code or declared dependencies. The server's credential JSON reader is configuration infrastructure, not a user-state database. This does not establish that memory is persisted on Walrus. |
| Persistent profiles, contacts, splits, and vaults on Sui Mainnet | **Scaffold only:** relevant Move types/functions and frontend builders/readers exist. The contract fails compilation; no package/registry IDs are configured and no deployed objects were verified. |
| Behavioral memory on Walrus Mainnet through MemWal | **Fail in the active server:** memory responses are mocked. Real persistence and recall were not demonstrated. |
| All Sui JSON-RPC through authenticated Tatum Mainnet | **Partial:** the browser provider/client target `/api/tatum-rpc`; Express forwards through the Tatum helper, and manual MemWal construction injects the shared client. An intercepted, network-free helper call confirmed the default URL and `x-api-key` header. Live authenticated routing could not be checked without a key. |
| Real Mainnet wallets and Circle USDC | **Partial:** the exact requested USDC type is the default in builders and readers. The three fallback friend addresses fail the installed SDK's `isValidSuiAddress` validation; no real secondary wallets are configured or verified. |

## Confirmed implementation defects

### 1. The development page crashes before rendering

Observed at `http://localhost:3000/` using the browser tools:

```text
ReferenceError: process is not defined
    at http://localhost:3000/src/lib/onchain-user-manager.ts:7:20
```

The accessibility tree contains only the empty page. The originating source reads `process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID` at module scope in [onchain-user-manager.ts](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/lib/onchain-user-manager.ts:8). Other frontend modules use the same environment pattern.

The active [server/index.mjs](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/server/index.mjs:45) configures Vite without a frontend environment mapping. The production build succeeds, but inspection of its bundle shows these environment reads become properties of empty objects, so the package and registry IDs are still not configured in the built frontend. A successful bundle is therefore not evidence of a working application.

### 2. The Move contract cannot compile

Command:

```powershell
sui move build --path move/solvency_loop --install-dir node_modules/.cache/solvency-verification/move-build
```

Result: exit code 1, `error[E07002]: mutable ownership violated`.

In [solvency_loop.move](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/move/solvency_loop/sources/solvency_loop.move:210), `share` still mutably borrows `split.participants` when the settlement event calls `object::id(split)` at line 221 and subsequently uses `share`. This prevents producing deployable bytecode from the current source.

The same code is in the pasted reference. Exact copying did not make that reference compile. No repair was made. No Move test files were found, and tests cannot proceed past this compilation error.

### 3. The active memory API does not use Walrus

[server/index.mjs](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/server/index.mjs:39) mounts [server/routes/memory.mjs](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/server/routes/memory.mjs:6), whose GET handler returns three hardcoded records. Its POST handler generates a blob-shaped string with `Math.random()` and reports success without calling MemWal.

Actual local probes:

| Request | Actual response |
| --- | --- |
| `GET /api/memory` | HTTP 200, three hardcoded records under `0x_default_agent` |
| `POST /api/memory` with `action: "recall_all"`, wallet `0x1` | HTTP 200, `{ "success": true, "blobId": "walrus://blob/0x...", "storedAt": ... }`; no recalled memories |
| Same recall request with `walletAddress: "invalid-wallet"` | HTTP 200 and another generated success response |

The dashboard sends `action`, `walletAddress`, `category`, and related fields. The mounted POST handler instead expects `agentId`, `actionType`, and `content`, and ignores the requested action. Consequently, recall, seeding, reflections, and settlement learning do not execute the intended memory operations.

The more complete [Next.js memory route](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/app/api/memory/route.ts:9) exists in source but is not used by `npm run dev`. The memory library also contains hardcoded fallback records, its manual client factory is not invoked by a user flow, and no application call to `restore()` was found.

### 4. The readiness script reports success without verification

[verify-mainnet-readiness.ts](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/scripts/verify-mainnet-readiness.ts:9) only logs constants and returns `true`. It has no RPC, registry read, MemWal health request, recall, or assertion that at least ten memories exist.

Executing it with Node's TypeScript stripping printed `Mainnet readiness check passed.` despite all required environment values being absent. This is a **false-positive check**, not successful mainnet verification. The documented `tsx` runner is not installed, so Node's built-in stripping was used without adding a dependency.

### 5. The active architecture and environment handling differ from the request

[package.json](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/package.json:1) provides only a `dev` script, which runs `node server/index.mjs`. The actual entry chain is `index.html` → `src/main.tsx` → `src/App.tsx`. The Next.js layout and API route files are not the active server entry points.

There are no repository `build`, `start`, `lint`, `test`, or verification scripts. Type checking and Vite bundling were invoked directly. `dotenv` is absent and the server does not load an environment file; placing values in `.env.local` alone would not configure this runtime.

### 6. Escrow is represented by a flag, without upfront funding enforcement

In [the Move contract](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/move/solvency_loop/sources/solvency_loop.move:151), split creation records `requires_upfront_escrow` and initializes an empty `escrowed_balance`. No function funds or consumes that balance. Settlement transfers the payment directly to the creator, and the flag is merely reported in an event.

The dashboard's [Sam rule](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/app/page.tsx:125) applies whenever matching memory text exists, without checking whether Sam's share exceeds 40 USDC. The panel accepts `escrowThresholdUsdc` but does not use it. The displayed escrow promise is therefore not enforced. These gaps also exist in the supplied reference design.

### 7. The liquidity floor is displayed but not enforced

[CooldownVaultPanel.tsx](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/components/CooldownVaultPanel.tsx:23) initializes a sweep of at least 1 USDC even when the wallet is below the floor. The lock button only checks `loading`; the handler/builder does not check that the remaining balance meets the floor, and the Move lock function does not consult the profile's floor.

The UI supplies a 24-hour duration, and the contract source includes owner and unlock-time checks for withdrawal. Those checks are present in source, but cannot be validated in execution while the contract does not compile. The contract accepts an arbitrary duration from callers rather than mandating 24 hours.

### 8. Friend wallet defaults are unverified and noncanonical

The [dashboard defaults](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/app/page.tsx:43) contain three 40-hex-digit addresses. `isValidSuiAddress()` from installed `@mysten/sui@2.38.0` returns `false` for each as written. They can be left-padded by `normalizeSuiAddress()`, but normalization would not prove ownership, existence of funds, or that Alex/Priya/Sam control them. No real secondary wallet values were supplied locally.

### 9. Additional completeness limitations

- [On-chain readers](C:/Users/singa/OneDrive/Documents/ChatGPT/solvency-loop/src/lib/onchain-user-manager.ts:119) retrieve only the latest 20 split creation events. Owned-vault and coin queries do not paginate, so larger histories or fragmented wallets can be incomplete.
- The unused Next.js seed route enqueues twelve `remember()` jobs and immediately reports twelve memories seeded. It does not wait for those jobs to commit or recall them to prove storage. Its recall branch also converts individual recall failures into empty results.
- Several financial behavioral claims are fixed text: for example, the panel says `Epoch #12`, and Priya is labelled a verified fast settler whenever memory recall is enabled, without checking for corresponding evidence.

## Dependency verification

`npm ls --all` exited 0: the installed dependency tree has no reported invalid required peers. Missing packages below are requirement omissions, not a claim that npm's peer resolution failed.

| Package | Local result |
| --- | --- |
| `@mysten-incubation/memwal` | 0.1.11 installed; satisfies the requested `^0.1.6` range |
| `@mysten/sui` | 2.38.0 installed |
| `@mysten/dapp-kit` | 1.1.17 installed |
| `@mysten/seal` | 1.5.2 installed as a peer dependency; not directly declared |
| `@mysten/walrus` | Missing; optional peer for installed MemWal, explicitly required by the pasted setup |
| `@tanstack/react-query` | 5.105.0 installed |
| `lucide-react` | Declared and installed |
| `clsx` | 2.1.1 installed transitively; not directly declared |
| `tailwind-merge` | Missing |
| `tsx` | Missing |
| `dotenv` | Missing |
| `next` | 16.4.3 installed; request specified Next.js 15; inactive runtime |
| React / React DOM | 18.3.1 installed |

The installed MemWal package requires Sui `>=2.5.0` and Seal `>=1.1.0`; its Walrus peer `>=1.0.3` is optional. Installed dapp-kit requires Sui `^2.26.1`, and installed Seal requires Sui `^2.38.0`. The installed Sui version satisfies these requirements. Node 22.16.0 satisfies the inspected Node engine requirements.

## Checks performed and their limits

| Check | Outcome |
| --- | --- |
| Locked dependency installation | **Pass** |
| `npm.cmd ls --all --json` | **Pass**, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | **Pass**, exit 0 |
| `node node_modules/vite/bin/vite.js build --outDir node_modules/.cache/solvency-verification/vite-dist` | **Pass**, exit 0, with dependency directive and chunk-size warnings |
| `npm.cmd run dev` | **Server starts** on port 3000 |
| Browser render | **Fail**, uncaught `process is not defined` and empty page |
| `GET /` | **HTTP 200**, HTML shell only |
| `GET /api/tatum/status` | `{"status":"no-api-key"}` |
| Checkpoint request through `/api/tatum-rpc` | **HTTP 500**, `TATUM_API_KEY is not set for this workspace` |
| Offline Tatum helper interception | Expected default Mainnet URL and `x-api-key` header; **zero network calls** |
| Five transaction builders | Registration/contacts, split creation, settlement, lock, and unlock construct their expected Move calls. Settlement/lock construct merge/split coin commands. **Offline only**, using temporary local IDs and mocked coin inventory; no signing, execution, gas estimation, or on-chain acceptance checked. |
| Circle USDC default | Exact requested type appears in inspected transaction type arguments |
| `sui move build ...` | **Fail**, E07002 at source line 221 |
| `node --experimental-strip-types scripts/verify-mainnet-readiness.ts` | Runs and prints success, but **performs no actual verification** |
| Mainnet registry/package, wallet balances, relayer health, ten recalled memories | **Not verified**: credentials and deployed object IDs are absent; active memory implementation and contract compilation also fail |

Detailed local inspection artifacts are under `node_modules/.cache/solvency-verification/`: dependency tree, required-file inventory, HTTP probes, intercepted routing request, and offline transaction inspection. They are ignored by Git. Move compiler artifacts are also under an ignored `node_modules` directory within the Move package because the install directory is resolved relative to that package.

## Completion state

Local checkout and dependency installation are complete. Every supplied instruction section was assessed, but the application cannot be certified as correctly implemented or mainnet-ready. The confirmed defects and unverified mainnet prerequisites above remain untouched, as requested.
