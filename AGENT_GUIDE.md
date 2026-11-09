# Gemini + Walrus workspace

The `/app` workspace opens on **Agent** after mandatory wallet-owned MemWal onboarding. The public landing is unchanged. The application uses Google's official `@google/genai` SDK and the pinned `gemini-3.5-flash-lite` model. See Google's [model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) and [Interactions API](https://ai.google.dev/gemini-api/docs/interactions).

## Operator setup

Add this **private server variable** to ignored `.env.local` or your hosting secrets, alongside your existing Tatum and MemWal configuration:

```dotenv
GEMINI_API_KEY=your_google_gemini_api_key
```

Create the key in [Google AI Studio](https://aistudio.google.com/apikey) and enable access/billing/quota for the requested model. Do not use a `NEXT_PUBLIC_` variable, paste keys into chat or commit `.env.local`. Restart the Next.js server after changing secrets. `/api/config` reports readiness and the model name without returning any key. `verify:infrastructure` and `verify:mainnet` require the key's presence; those checks do not call the paid Gemini API or prove its quota/model access. The manual agent path uses the existing core. Optional autonomous execution requires the contract extension, executor configuration and funded user consent in [AUTOPILOT_GUIDE.md](./AUTOPILOT_GUIDE.md).

## How to use the agent

1. Complete MemWal onboarding, choose quiet memory or individual approvals and authorize the learning request. An empty account works.
2. Describe an actual bill, purchase, payment, vault action, contact or fact to remember in the blank composer. Identify saved contacts by name or wallet. Provide the amount in USDC. The agent asks for essential missing information rather than inventing it.
3. Read the returned proposal. The application calculates exact micro-USDC shares, applies stored preferences and independently verified settlement history, and shows the creator share, total and upfront flags. Alcohol exclusions need actual receipt amounts.
4. Without funded authority, choose **Review split**, **Review memory update** or the corresponding action and inspect its dialog. With an active allowance, a direct eligible command can execute within the previously approved scope; **Draft only**, questions and previews retain review. Quiet memory also allows explicit private memory commands without a repeated wallet prompt. Unsupported actions keep their manual wallet review.
5. Read the confirmed transaction or memory result. A submitted transaction is not a confirmation. An uncertain confirmation blocks another financial action until checked. A failed settlement-memory update can be retried without paying again.

Enter sends a message; Shift+Enter inserts a line break. A proposed action expires after five minutes and cannot be replayed from restored history. Ask again for fresh validation. **Edit items manually** transfers your actual proposed bill into the existing editor, which recalls fresh learning before review.

While a reply is loading, **Agent activity** shows live request stages. Open a step to inspect the data it uses, or expand the full timeline. The stages reflect account checks, memory recall, receipt verification, bill reads, Gemini interpretation and proposal validation as they run. Audit, memory-write and execution stages appear only when that work is performed. Completed activity steps do not establish payment confirmation; use the reply's actual receipt status. Ordinary chat and status questions retain their existing read-only memory behavior.

**Split Canvas**, **Cooldown Vault** and **Escrow Desk** retain the manual flows. The reflection quick action opens 48-hour check-ins, while **Audit** and the proof drawer expose memory, preferences, contacts and account management. No example contacts, preset amounts or fake conversation are supplied. The reference shader has pause, reduced-motion, data-saver and WebGL fallbacks.

## Why both services are required

Each signed `/api/agent` request follows this sequence:

1. Verify the wallet signature, timestamp, nonce and origin. Resolve the caller's on-chain profile and its owned, active, authorized MemWal account.
2. Recall the caller's Walrus namespaces and verify settlement evidence through Tatum. Sign-in and draft preparation are read-only. Use the Memory workspace to import confirmed settlement history. Pending-split questions read current Sui bills without contacting Gemini or Walrus. Failed decryption or a relayer failure stops the request.
3. Load live profile/balance, eligible bills, owned vaults, current public preferences, unanimously approved group conventions and optional allowance scope. Send relevant account data, recalled context and thread history to Gemini as data. Gemini interprets intent using a constrained JSON schema; it has no arbitrary RPC, code execution or credential access.
4. Validate its output against actual saved contacts and current on-chain objects. The application performs the allocation math and eligibility checks. Unknown names, malformed amounts, wrong tokens and unavailable objects produce clarification. Only the connected wallet's eligible shares can be proposed for payment.
5. Return ordinary replies and drafts to the tab. Under Quiet Memory, check Gemini's typed candidates against explicit standing preferences in the current message. Batch changed preferences with MemWal `rememberBulkAndWait` after the reply. For funded execution, confirm a separate audit record of the validated action before invoking the executor.
6. Reuse the existing reviewed manual builders or, after explicit funded consent, the strictly validated delegated builders. Move remains the final authority. Confirmed receipts and actual allocations are batch-learned; repayment evidence comes only from independently checked settlement events. Background incoming tasks use the payer's own active allowance and memory account, not a creator's authorization.

Gemini calls use `store:false` with no provider-side conversation identifier. Each request includes relevant account data and recalled memories. The tab can supply up to three recent exchanges for follow-ups. Ordinary chat stays in tab memory and clears on reload. Existing `SOLVENCY_AGENT_V1` records remain readable. Namespace ownership and permissions remain those of [Walrus Memory](https://docs.wal.app/walrus-memory).

Personal notes remain self-reported context. Explicit structured payment preferences use `SOLVENCY_RULE_V1`. Tracked purchases and ratings use the habit and cash-flow records. **Memory → What the agent remembers** displays committed standing bill categories and split styles. Edits supersede earlier values. **Stop using** suppresses the preference in future suggestions. The background task is best effort and checks the current linked account, delegate and grant expiry before sending. Suggested categories reflect recent real bills. Learned preferences and tab history are excluded from the automatic execution context.

## Validation limits

Automated tests use test-only injected providers and Playwright-intercepted component fixtures. They cannot sign or send a live transaction. Local tests verify real SDK request serialization, pinned model, structured output, `store:false`, owned memory access, fail-closed commits, amount/eligibility checks and UI review boundaries. A live acceptance pass still needs your configured Gemini quota and wallet-approved requests; no such approval or financial transaction is implied by building the application.
