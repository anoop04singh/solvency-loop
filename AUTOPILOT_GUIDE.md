# Quiet memory and funded agent authority

The workspace retains its existing design, mandatory owned MemWal onboarding and manual financial screens. **Autopilot** adds two separate opt-in permissions: temporary browser memory authorization and a funded on-chain USDC allowance. Neither is enabled by installing this update. The new contract extension must be upgraded onto Mainnet before funded automation is available.

## User flow

1. Connect your wallet, create or discover your owned MemWal account, authorize the app delegate and complete profile registration. Empty memory accounts work.
2. Choose **Enable quiet memory**, read the scope and approve one wallet message. A temporary, nonextractable browser key signs subsequent payload-bound requests for up to one hour. It is discarded on reload, wallet/network change or **Use individual approvals**. Expiry requires an explicit renewal. The server still verifies the wallet grant, exact account/origin/action, timestamp and nonce, then checks live MemWal ownership and delegate access for every operation.
3. In **Autopilot**, choose **Set up agent allowance**. Enter a USDC budget, per-transaction maximum, rolling 24-hour maximum, expiry of 1–30 days, actual saved counterparties and permitted operations. Inputs start empty. Review and fund the allowance with your wallet. This is separate financial consent; enabling quiet memory alone cannot authorize a payment.
4. Give a direct command in chat. Gemini interprets the request. The application checks actual contacts, bill state, exact allocations and allowance scope. It recalls owned Walrus context and commits an audit of the validated action using Quilt before sending any delegated financial transaction. Eligible commands use the funded allowance without another payment popup. **Draft only**, previews, questions, unsupported operations and out-of-scope proposals retain review. Multi-bill batch settlement remains manual.
5. Read the actual receipt. **Submitted** is not confirmation. An interrupted response blocks further financial actions until its on-chain receipt is recovered or the owner revokes the old allowance policy. **Check receipt** retries learning and event delivery without resending the original payment.

Use **Top up**, **Change policy**, **Withdraw** and **Revoke agent** to manage authority. Revocation and withdrawals remain available during routine pending work and without an active memory delegate. They invalidate previously prepared commands by incrementing the policy epoch. They cannot reverse already confirmed payments. Reconfiguration and funding do not erase rolling spending or replay records. Changing a profile's linked memory account requires reconfiguring its allowance before automation resumes.

The agent can spend only the deposited budget. Limits bound exposure; they do not guarantee that an AI decision or incoming invoice is correct. Payments to approved counterparties are permitted within that budget. Incoming handling, bill creation/activation and cooldown protection have separate opt-ins. Move enforces the executor, actual owned active linked MemWal account and delegate, expiry, epoch, payees, native Circle USDC, exact escrow amounts, a true rolling 24-hour debit total, aggregate per-transaction debits and a rolling maximum of 64 actions. New allowance funding and topups preserve the profile's USDC reserve floor. SUI pays gas, including gas in the dedicated executor wallet.

An upfront share is funded into the existing escrow. It is not learned as settled until creator activation emits the real settlement event. Agent-created bills and cooldown vaults belong to the human owner. The owner retains the existing cancellation, refund and matured-withdrawal flows.

## Shared learning

Each wallet owns its linked MemWal account. Standing preferences, regrets, cash-flow observations and personal payment rules are stored there. Ordinary chat stays in tab memory. `sl_network_commons` is a namespace in the same owned account. Account and delegate permissions govern namespace access.

- **Public preferences:** a person explicitly publishes their own alcohol/vegetarian preferences on Sui. Other users read the current active object; private statements about friends are not automatically published. Revocation stops future app reuse, but cannot erase public chain history or copies already stored by others. Alcohol exclusions require an actual food/drinks breakdown; vegetarian status is context, not an invented receipt allocation.
- **Group conventions:** members and percentage weights are public and immutable, totaling exactly 100%. Every member must approve before automatic reuse. Each member can revoke. Creating a proposal indexes only its creator; other members are indexed after acceptance. Pending discovery examines the latest 50 creation events; ask the creator to share the group ID if an older proposal is outside that sample.
- **Repayment behavior:** imported observations are independently verified against successful exact-package settlement events and native-USDC split objects. Timing is factual; the existing last-five/minimum-three rules drive recommendations. One fast payment does not invent a new reputation percentage.
- **Benchmarks:** bounded samples of distinct public bill objects can yield per-person statistics for a repeated bill title, with at least three sources. Titles are not verified merchant identities. Private tracked purchases and regrets are never pooled into these figures.

Gemini uses the official `@google/genai` integration and **gemini-3.5-flash-lite**. Recall, validated actions, confirmed Quilt audits and receipt learning form the execution loop. Failed recall or a failed audit commit stops funded execution. Learning failures after a confirmed payment can be retried through receipt recovery. Quilt batches contain at most 20 items, and every returned item must be committed. See the [Walrus agent storage loop](https://docs.wal.app/walrus-memory/sdk/agent-storage-loop) and [headless setup](https://docs.wal.app/walrus-memory/sdk/headless-setup).

## Upgrade the existing Mainnet package

These are owner-operated steps. No deployment, signing or live financial transaction was performed while implementing this update. **Upgrade the existing package; do not publish a fresh core/registry and strand existing profiles and bills.** Existing public core signatures and object layouts are preserved; the compatible `autopilot` module adds new types and package-internal helpers. Review [Sui package upgrades](https://docs.sui.io/develop/publish-upgrade-packages/upgrade) and [type/version behavior](https://docs.sui.io/develop/publish-upgrade-packages/versioning).

1. Run `npm.cmd run sui:install` and use the pinned **1.82.3** project CLI/VM, with the matching framework commit `bf4073918ed33cfa0b09c500658fa116a774bcfd`. An isolated 1.72.2 verifier supplies the dependency-only check removed from the newer CLI; do not run tests on its old VM. See [MOVE_DEPLOYMENT.md](./MOVE_DEPLOYMENT.md) for installation and the fresh-publication alternative. Confirm `npm.cmd run sui -- client chain-identifier --format hex` returns `35834a8a`, your active address owns the UpgradeCap and you have SUI gas. Application RPC stays on authenticated Tatum `/graphql`; CLI steps use Sui Mainnet directly without a bridge.
2. Stop the Next.js preview before the build, then run:

   ```powershell
   npm.cmd run check
   npm.cmd run move:build
   npm.cmd run move:test
   npm.cmd run move:verify-bundle
   npm.cmd run move:verify-deps
   ```

   Keep dependency verification enabled. Never use `--skip-verify-deps` or publish the already deployed MemWal dependency. Retain `Move.lock`, pinned vendor provenance and publication metadata.
3. The recorded version-1 package is `0xe448010302277b67cdb460c2120916d861630f728374027877031c631e358d3c`. Its recorded UpgradeCap is `0x2b173cd1ce046da133e1792ef1842c4f3e08d1f578ea3f352114256565c623de`. Confirm the current chain state and ownership; do not assume this historical record is still the latest version. Simulate the upgrade, inspect its results, then execute the same command without `--dry-run`:

   ```powershell
   npm.cmd run sui -- client upgrade .\move\solvency_loop --upgrade-capability 0x2b173cd1ce046da133e1792ef1842c4f3e08d1f578ea3f352114256565c623de --verify-deps --dry-run --json
   ```

   The CLI estimates gas if a budget is omitted; optionally supply a budget in MIST that covers its estimate. Resolve compatibility/dependency failures before proceeding. A local compilation does not prove Mainnet upgrade acceptance.
4. Copy the new package ID from the successful upgrade output. An upgrade does not rerun `init`. Create the new shared directory once, using that new package ID:

   ```powershell
   npm.cmd run sui -- client call --package YOUR_NEW_UPGRADE_PACKAGE_ID --module autopilot --function create_agent_directory --json
   ```

   Copy the created `::autopilot::AgentDirectory` object's ID and full object type. Keep its directory ID consistent for all users. Record publication metadata and verify the published root with `npm.cmd run sui -- client verify-source .\move\solvency_loop --build-env mainnet`. The project wrapper runs the separate dependency-only verifier before publish/upgrade. Do not add `--build-env` to those two deployment commands on 1.82.3; they use the active CLI environment.
5. Keep **`NEXT_PUBLIC_SOLVENCY_PACKAGE_ID` and `NEXT_PUBLIC_SOLVENCY_REGISTRY_ID` unchanged**: these still identify the original core types and existing manual entry points. Set only the new extension variables below. Later extension upgrades can have a new call target while retaining the original extension type prefix; the directory's exact object type identifies `NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN`.

## New configuration and activation

Keep all existing Tatum, MemWal, embedding and Gemini variables. Add the following to ignored `.env.local` or host secrets. Public deployment IDs are not credentials. Private values must never use `NEXT_PUBLIC_`.

```dotenv
AUTOPILOT_ENABLED=false
SUI_AGENT_PRIVATE_KEY=
NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS=
NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID=
NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN=
NEXT_PUBLIC_AGENT_DIRECTORY_ID=
AUTOPILOT_WEBHOOK_SECRET=
```

- `SUI_AGENT_PRIVATE_KEY`: a **dedicated executor's** Sui Ed25519 `suiprivkey...`, generated and held by the operator. Never reuse a customer's wallet or the MemWal delegate key. Supply enough SUI for the executor's actual gas workload. Do not fund this key with customers' USDC; budgets are in their shared allowance objects.
- `NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS`: the Sui address derived from that exact executor key. It must differ from each user's wallet. Setup rejects a wallet assigned as its own executor before requesting wallet approval. Readiness rejects a key/address mismatch.
- `NEXT_PUBLIC_AUTOPILOT_PACKAGE_ID`: the new upgraded package call target.
- `NEXT_PUBLIC_AUTOPILOT_TYPE_ORIGIN`: prefix of the newly created directory's `::autopilot::AgentDirectory` type. Usually equals the first package introducing this module; keep it stable across future upgrades.
- `NEXT_PUBLIC_AGENT_DIRECTORY_ID`: the one shared directory created above.
- `AUTOPILOT_ENABLED`: operator switch. Keep `false` while configuring and validating. `true` makes the funded executor available and enables event handling. Rebuild/restart after public configuration changes. Switching this off stops this server's work; use on-chain owner revocation to invalidate authority itself.
- `AUTOPILOT_WEBHOOK_SECRET`: optional random secret of at least 32 characters for authenticated external event delivery. No external subscription is created by this update.

If allowance creation reports **Move abort 202 at instruction 68**, the creation assertion rejected an existing directory entry, an invalid executor, an empty deposit or an insufficient remaining reserve. An executor equal to the owner is invalid. Use a dedicated operator wallet, set its matching private key and derived public address in the two executor variables, and rebuild/restart the app. An existing allowance must be managed through **Change policy** or **Top up**. These configuration and UI fixes require no contract redeployment.

After filling the IDs and key, run a **read-only** preflight while the switch is still false:

```powershell
npm.cmd run verify:mainnet -- --infrastructure-only --autopilot
```

It checks chain/configuration, the directory and exact new function argument shapes, including linked MemWal references, and executor key/address matching. It does not invoke Gemini, fund a vault, prove gas availability or send a transaction. After the operator enables the switch and restarts the app, each user still has to opt in and approve their own funded scope. No allowance is auto-created.

## Event delivery and operation

The app gateway schedules confirmed manual executions through Next.js `after()`; confirmed agent executions also dispatch their bill events. A recipient's own current incoming-payment consent is checked, not the creator's signature. Gemini and Walrus process a scoped incoming task before any eligible payment. Duplicate events use deterministic request IDs and Move receipts. No signed transaction is automatically retried.

This is event-driven, with no RPC polling. App-originated delivery is best effort and requires a running server/runtime with enough execution time. For reliable off-app or interrupted delivery, connect an external event source/queue to **POST `/api/autopilot/events`** and retry failed deliveries with a fresh signature. Sui is not listed in the consulted [Tatum Notifications supported chains](https://docs.tatum.io/reference/notifications-supported-chains); this app does not invent a Tatum Sui subscription.

The endpoint accepts the exact JSON body `{"digest":"CONFIRMED_SUI_TRANSACTION_DIGEST"}`. Send `x-solvency-issued-at` as Unix milliseconds and `x-solvency-signature` as lowercase hex HMAC-SHA256 of `<timestamp>.<exact raw body>` using `AUTOPILOT_WEBHOOK_SECRET`. Sign on the trusted server, never in the browser. It rejects signatures more than five minutes old and independently checks successful chain effects and exact core events. Delivery is bounded to 20 distinct bills per transaction. Duplicate receipt checks prevent a second payment; delivery is not an exactly-once availability guarantee. Run one signing worker per executor key to avoid competing gas-coin selection across server instances.

Before accepting real funds, perform the owner-approved Mainnet acceptance pass with small personally chosen amounts: quiet-memory renewal; fund and revoke an allowance; under-limit ordinary/upfront shares; creator activation; an out-of-scope counterparty and over-limit command; duplicate delivery; interrupted-response receipt recovery; memory-only retry; owner withdrawal; and unanimously approved group reuse. Those live actions are separate from local automated verification.
