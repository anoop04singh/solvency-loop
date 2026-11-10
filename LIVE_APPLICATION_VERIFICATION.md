# Owner-operated live application verification

This explicitly invoked Mainnet run creates real, clearly labeled verification history. It uses the existing application files and deployed contracts, real Gemini 3.5 Flash Lite requests, authenticated HTTP APIs, MemWal/Walrus commits, the dedicated executor and native Circle USDC. It does not use mocked RPC, test fixtures, fake merchant purchases or backdated timestamps.

The private keys act as wallet signing adapters. This covers the application services and transaction flow; it does not automate or validate a browser extension popup or visual layout. Each wallet runs in an isolated process with the application's actual in-memory Quiet Memory grant and P-256 request signing. The grant is bounded to the exact wallet/account/origin for at most one hour. No session grant, signature or private key is written to the reports.

## Configuration and invocation

1. Complete the normal `.env.local` setup, including the real deployed Autopilot extension and dedicated executor. `AUTOPILOT_ENABLED=true` is necessary for this intentionally live run. The executor must be different from wallets A/B/C and have its own SUI gas.
2. Set `WALLET_A_PRIVATEKEY`, `WALLET_B_PRIVATEKEY`, `WALLET_C_PRIVATEKEY` in ignored `.env.local`. Use three distinct funded Ed25519 wallets. Set a random server-only `AUTOPILOT_WEBHOOK_SECRET` of at least 32 characters so verified event retries use the same application's real HTTP endpoint and executor queue. Never commit secrets or include them in a video.

   The three owner-wallet keys are local verification credentials only. Do not copy them into Vercel's application environment; the running application uses wallet approvals and its separately configured dedicated executor.
3. Run `npm run verify:infrastructure -- --autopilot`.
4. Build the app with `npm run build`, then start the real server with `npm start`. Use the origin configured in `APP_ORIGIN` (default `http://127.0.0.1:3000`). Do not run development and production builds against the same `.next` directory.
5. `npm run verify:live -- --run-id YOUR-UNIQUE-RUN-ID` performs a read-only preflight. It submits no transaction, signs no grant and writes no Walrus memory.
6. Only with owner authorization, run `npm run verify:live -- --execute --run-id YOUR-UNIQUE-RUN-ID` to create the history. The default test suite never invokes it. Passing the same run ID resumes completed steps rather than paying or writing them again. An unresolved wallet transaction stops the run for receipt reconciliation. An interrupted Autopilot command is recovered only when its original on-chain request receipt exists; the actual authenticated `agent_status` API relearns that receipt. No replacement financial command is sent.
7. `npm run verify:live -- --report-only --run-id YOUR-UNIQUE-RUN-ID` rebuilds the report from captured evidence without starting wallet workers or making a network request.
8. `npm run verify:live -- --audit-only --run-id YOUR-UNIQUE-RUN-ID` re-reads all seven bills, profiles, owned memory permissions, live allowances, cooldowns and executor balances. It reconciles all 37 confirmed transactions, 14 settlement events and 9 agent actions, and verifies conservation of the original 3 USDC using bigint units. It submits no transaction and writes no Walrus memory.

## Bounded scenarios

- Genuine MemWal account creation, app delegate authorization, profile registration and reciprocal contacts using the supplied wallets, labeled **Loop A**, **Loop B**, **Loop C**.
- Quiet Memory: one personal-message grant per wallet process, then signed delegated requests. A pending-split status question must create zero memories.
- Three creator rotations with Gemini-prepared, categorized, reviewed 0.06 USDC bills and actual 0.02 USDC debtor payments. Verified on-chain settlement memories are written separately into each involved owner's account.
- A saved payment preference changes a real bill's escrow flag, followed by upfront funding, creator activation, settlement and receipt learning. The temporary verification preference is then restored to standard settlement.
- Each wallet funds a 0.10 USDC allowance: 0.03 per action, 0.10 rolling daily cap, one-day expiry, only the other supplied wallets as payees. Incoming payment, bill creation and cooldown permissions are explicitly scoped in the recorded policy.
- Gemini-prepared 0.01 USDC cooldown deposits; premature withdrawal is checked through unsigned preparation/simulation. Real unlock times are recorded.
- Gemini-directed 0.03 USDC Autopilot bills, real event-triggered incoming payments and on-chain agent receipts. The script delivers only actual confirmed transaction digests to the application's event service; it does not manufacture notifications or run a polling worker.
- Actual Walrus analysis, restore and final recall. Success requires at least ten distinct readable Walrus blobs per wallet. Memories describe actual evidence or explicit verification policies; raw chat transcripts and filler are not saved to meet a count.

Regret ratings are randomized only for the immediate guard test. A fresh bill must be rejected until its actual creation time plus 6 hours. The run does not change this rule or claim a successful early rating. Similarly, the 24-hour cooldown remains in force. A later owner-run session can rate genuinely due bills and withdraw matured vaults through the application.

## Audit and cleanup

Each run writes ignored local artifacts under `.live-verification/<run-id>/`:

- `REPORT.md`: outcome, scenario evidence, final wallet balances, grants, allowance policies and cooldown unlock times.
- `actions.jsonl`: action requests, actual progress stages, decisions, failures, memory responses and transaction receipts.
- `state.json`: completed step inputs/results and known transaction digests for resumption.
- `memories.json`: exact observed memory text, namespaces and blob IDs, tagged by wallet and observation step.

Review these files before sharing: they intentionally document wallet addresses and financial/memory activity. They exclude private keys, wallet signatures and delegated signing keys. This audit is not an application database and is never loaded by the workspace UI.

Allowances remain available until their recorded expiry or owner revocation; they are not silently revoked at the end because the requested video needs the feature available. Owners can revoke or withdraw remaining allowance funds in the app. Cooldown funds remain locked until the contract's recorded maturity. Bills and committed Walrus memories are genuine Mainnet history and are not erased as test cleanup. No deployment, upgrade or global CLI change is performed.

Confirmed user actions now return their own receipt before incoming-payment processing continues through Next.js `after`. Incoming recipient contexts overlap two at a time; the dedicated executor continues to serialize transaction building/signing. This keeps the chat response independent of other wallets' memory writes. Serverless work remains bounded by the host duration; event-delivery retries must use the confirmed digest and on-chain receipts rather than replay a user's financial intent.

## Six-hour regret follow-up

The owner subsequently requested reducing the app-wide regret delay to six hours and randomly rating the purchases/bills from the three verification wallets. The current shared delay is six hours in the API, reader, UI and Gemini guidance. The original run's 48-hour observations remain historical; original purchase times and the independent 24-hour contract cooldown are preserved.

After rebuilding and starting the actual app, invoke:

```powershell
npm run verify:regret -- --execute --source-run live-mainnet-2026-11-10 --run-id regret-six-hours-2026-11-10
```

This uses the original live wallet workers, a fresh real Quiet Memory grant per wallet process, actual on-chain bill reads and the signed memory API. It finds genuine owned recorded purchases and the source run's created bills, rates eligible unrated entries, commits both regret and cash-flow facts, then verifies them in live recall. It persists a randomized mix of Worth It and Regretted before writing; the same run ID resumes those choices. It documents randomized verification provenance in each account. No new purchase, historical date, financial transaction or deployment is invented to make the test pass. Plain invocation without `--execute` performs no action.

Its separate ignored run directory contains `REPORT.md`, `state.json`, `actions.jsonl`, and `memories-written.json`. Existing original-run reports are preserved. Owner-wallet test keys remain local-only and are not application host configuration.
