# Gemini + Walrus workspace

The `/app` workspace opens on **Agent** after mandatory wallet-owned MemWal onboarding. The public landing is unchanged. The application uses Google's official `@google/genai` SDK and the pinned `gemini-3.5-flash-lite` model. See Google's [model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) and [Interactions API](https://ai.google.dev/gemini-api/docs/interactions).

## Operator setup

Add this **private server variable** to ignored `.env.local` or your hosting secrets, alongside your existing Tatum and MemWal configuration:

```dotenv
GEMINI_API_KEY=your_google_gemini_api_key
```

Create the key in [Google AI Studio](https://aistudio.google.com/apikey) and enable access/billing/quota for the requested model. Do not use a `NEXT_PUBLIC_` variable, paste keys into chat or commit `.env.local`. Restart the Next.js server after changing secrets. `/api/config` reports readiness and the model name without returning any key. `verify:infrastructure` and `verify:mainnet` require the key's presence; those checks do not call the paid Gemini API or prove its quota/model access. No contract changes or redeployment are required for this update.

## How to use the agent

1. Complete the existing MemWal onboarding and approve the signed learning request. An empty account works.
2. Describe an actual bill, purchase, payment, vault action, contact or fact to remember in the blank composer. Identify saved contacts by name or wallet. Provide the amount in USDC. The agent asks for essential missing information rather than inventing it.
3. Read the returned proposal. The application calculates exact micro-USDC shares, applies stored preferences and independently verified settlement history, and shows the creator share, total and upfront flags. Alcohol exclusions need actual receipt amounts.
4. Choose **Review split**, **Review memory update** or the corresponding action. Inspect the details in the review dialog. Continuing opens the appropriate wallet transaction or personal-message signature. Chat alone never pays a share, creates a bill or changes a lasting payment preference.
5. Read the confirmed transaction or memory result. A submitted transaction is not a confirmation. An uncertain confirmation blocks another financial action until checked. A failed settlement-memory update can be retried without paying again.

Enter sends a message; Shift+Enter inserts a line break. A proposed action expires after five minutes and cannot be replayed from restored history. Ask again for fresh validation. **Edit items manually** transfers your actual proposed bill into the existing editor, which recalls fresh learning before review.

**Split Canvas**, **Cooldown Vault** and **Escrow Desk** retain the manual flows. The reflection quick action opens 48-hour check-ins, while **Audit** and the proof drawer expose memory, preferences, contacts and account management. No example contacts, preset amounts or fake conversation are supplied. The reference shader has pause, reduced-motion, data-saver and WebGL fallbacks.

## Why both services are required

Each signed `/api/agent` request follows this sequence:

1. Verify the wallet signature, timestamp, nonce and origin. Resolve the caller's on-chain profile and its owned, active, authorized MemWal account.
2. Synchronize a bounded sample of confirmed settlement events through Tatum and recall the caller's Walrus namespaces and conversation. Failed decryption or a relayer failure stops the request.
3. Load live profile/balance, eligible bills and owned vaults. Send relevant account data, recalled context and thread history to Gemini as data. Gemini interprets intent using a constrained JSON schema; it has no transaction tools, arbitrary RPC, code execution or credential access.
4. Validate its output against actual saved contacts and current on-chain objects. The application performs the allocation math and eligibility checks. Unknown names, malformed amounts, wrong tokens and unavailable objects produce clarification. Only the connected wallet's eligible shares can be proposed for payment.
5. Commit the conversation and validated **proposal** with MemWal `rememberAndWait`. Only a committed blob permits a response with a reviewable action. Without Gemini there is no intent; without Walrus there is no context or committed proposal. There is no alternative model, heuristic chat parser or memory-off fallback.
6. After user review, reuse the existing Move transaction builders and wallet approvals. The Move contract remains the final authority. Settlement learning records independently checked chain events, separately from conversation records.

Gemini calls use `store:false` with no provider-side conversation identifier. Context is rebuilt from Walrus on every turn. This disables Interactions conversation storage; it does **not** make a claim about Google's wider API data processing/retention policies. Relevant public profile/contact/bill details and recalled behavioral memories are sent to Google; that disclosure is shown beside the composer. Conversations and drafts are saved in the user's `social_split_trust` namespace as `SOLVENCY_AGENT_V1` records, not in an application database or browser persistence. Namespace ownership and permissions remain those of [Walrus Memory](https://docs.wal.app/walrus-memory).

Personal notes remain self-reported context. Explicit structured preferences become `SOLVENCY_RULE_V1` only after their own signed review. Tracked purchases and ratings use the existing habit/cash-flow records. A proposed payment in conversation never counts as repayment proof. The agent's loaded sample is bounded (up to 30 bills/vaults, 60 context blobs and 12 thread turns); use the manual screens to load/open earlier objects and inspect more history. Semantic recall can return a subset of older conversations. **New conversation** creates a new thread; it does not erase existing Walrus blobs.

## Validation limits

Automated tests use test-only injected providers and Playwright-intercepted component fixtures. They cannot sign or send a live transaction. Local tests verify real SDK request serialization, pinned model, structured output, `store:false`, owned memory access, fail-closed commits, amount/eligibility checks and UI review boundaries. A live acceptance pass still needs your configured Gemini quota and wallet-approved requests; no such approval or financial transaction is implied by building the application.
