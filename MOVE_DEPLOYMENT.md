# Mainnet CLI and fresh publication

The supported project toolchain is official **Sui 1.82.3** (`bf4073918ed33cfa0b09c500658fa116a774bcfd`), matching the framework sources in both Move manifests and lockfiles. Use the project commands below. A bare `sui` command can still resolve your older global installation.

The old 1.72.2 pin caused the reported Mainnet source mismatches and missing `allowance`, `scratch` and `forwarding_address` modules. Updating the framework alone fixes bytecode verification, but the 1.72.2 test VM lacks the newer natives. The current CLI passes all 47 tests. Its `verify-source` command also changed: `--verify-deps` and `--skip-source` are no longer accepted there. The project therefore isolates an official 1.72.2 **read-only dependency verifier**, while build/test/deployment use 1.82.3. Project publish/upgrade commands run that explicit preflight first; they do not rely on a retained CLI flag to perform it. See the [1.82.3 release](https://github.com/MystenLabs/sui/releases/tag/mainnet-v1.82.3) and its [CLI implementation](https://github.com/MystenLabs/sui/blob/mainnet-v1.82.3/crates/sui/src/client_commands.rs).

## Install and check

```powershell
Set-Location "C:\Users\singa\OneDrive\Documents\ChatGPT\solvency-loop"
npm.cmd run sui:install
npm.cmd run sui -- --version
npm.cmd run sui -- client envs
```

The installer selects only pinned official GitHub release binaries, verifies the release archive's committed SHA256 and extracts the CLI under ignored `.tools/sui/<version>`. It reuses a matching global binary when available. It does not replace your global CLI, modify PATH, create a wallet or sign anything. Linux/macOS release hashes are pinned too. `SUI_CLI_PATH` and `SUI_VERIFY_CLI_PATH`, if needed, select existing matching binaries without changing system PATH.

Reuse your existing `solvency-direct-mainnet` environment if it already points to Sui Mainnet. Otherwise add it once:

```powershell
npm.cmd run sui -- client new-env --alias solvency-direct-mainnet --rpc https://fullnode.mainnet.sui.io:443
```

```powershell
npm.cmd run sui -- client switch --env solvency-direct-mainnet
npm.cmd run sui -- client chain-identifier --format hex
npm.cmd run sui -- client active-address
npm.cmd run sui -- client gas
```

Confirm chain `35834a8a`, your intended deployer and sufficient SUI gas. These are owner-operated CLI steps using Sui directly, without a Tatum bridge. Application traffic continues through authenticated Tatum GraphQL.

## Checks before publication

Run sequentially because the commands use the same Move build directory:

```powershell
npm.cmd run move:build
npm.cmd run move:test
npm.cmd run move:verify-bundle
npm.cmd run move:verify-deps
```

The last command performs live read-only source verification of the current Mainnet framework and the existing MemWal package. It does not sign, serialize a payment or submit a transaction. It must succeed; do not substitute a skip flag. On 2026-11-03, all 47 Move tests, the two-module offline bundle, this Mainnet dependency check and the unsigned fresh-publish simulation below passed. The root's unpublished source is deliberately excluded from this dependency-only check.

## Fresh publication

Fresh publication creates a separate package and registry. Existing profiles, bills and vaults remain in the previous deployment. Preserve its IDs and access path for any existing funds. Users register a new SolvencyLoop profile and reuse their actual owned MemWal account. Keep the external MemWal package/registry and delegate settings unchanged.

For fresh publication, the root `move/solvency_loop/Published.toml` must not identify the old deployment. If you have already renamed it to `Published-old.toml`, leave that backup alone. Otherwise back it up once:

```powershell
Rename-Item -LiteralPath .\move\solvency_loop\Published.toml -NewName ("Published.previous-mainnet-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".toml")
```

Keep `move/vendor/memwal/Published.toml` and both lockfiles intact. MemWal is already deployed and must not be republished with this application.

Simulate first:

```powershell
npm.cmd run sui -- client publish .\move\solvency_loop --verify-deps --dry-run --json
```

**Publish only after reviewing a successful simulation.** This next command signs a Mainnet transaction and spends SUI:

```powershell
npm.cmd --silent run sui -- client publish .\move\solvency_loop --verify-deps --json
```

Do not add `--build-env` to publish/upgrade on 1.82.3; those commands use the active CLI network. Keep it on offline Move build/test commands. The project wrapper runs the real dependency-only verification before either deployment command, including dry runs. Preflight messages go to stderr so `--silent` plus `--json` can be captured as JSON. No signed mutation is automatically retried.

Record the new package ID, created `::core::SolvencyRegistry` object ID and UpgradeCap from `objectChanges`. Preserve the newly generated publication metadata. Verify the newly published root with the current CLI:

```powershell
npm.cmd run sui -- client verify-source .\move\solvency_loop --build-env mainnet
```

This verifies the published root against its publication/toolchain metadata. Dependency verification is the separate command above.

## Directory and application settings

Replace `YOUR_NEW_PACKAGE_ID` with the real ID from publication:

```powershell
npm.cmd run sui -- client call --package YOUR_NEW_PACKAGE_ID --module autopilot --function create_agent_directory --dry-run --json
npm.cmd run sui -- client call --package YOUR_NEW_PACKAGE_ID --module autopilot --function create_agent_directory --json
```

The second command creates the shared directory and spends gas. Record its `::autopilot::AgentDirectory` object ID. Set these in ignored `.env.local`:

```dotenv
NEXT_PUBLIC_SOLVENCY_PACKAGE_ID=YOUR_NEW_PACKAGE_ID
NEXT_PUBLIC_SOLVENCY_REGISTRY_ID=YOUR_NEW_REGISTRY_ID
NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID=YOUR_NEW_PACKAGE_ID
NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN=YOUR_NEW_PACKAGE_ID
NEXT_PUBLIC_AGENT_DIRECTORY_ID=YOUR_NEW_DIRECTORY_ID
AUTOPILOT_ENABLED=false
```

Configure the dedicated executor and complete read-only readiness before enabling it, following [AUTOPILOT_GUIDE.md](./AUTOPILOT_GUIDE.md). Each user must separately approve their own funded allowance. Stop the Next.js server before rebuilding; restart after changing public deployment settings. No deployment, key generation, signing or live transaction was performed while fixing the dependency mismatch.
