# SolvencyLoop verification report

**Review date: 10 November 2026.** This report accompanies the [technical blog](./SOLVENCYLOOP_TECHNICAL_BLOG.md). It describes the current working tree and dated evidence from three owner-authorized verification runs. It is an engineering verification report, not an independent security audit or a study of consumer financial outcomes.

The main result is that real bill creation, payment, memory commits and funded agent payments completed and reconciled. Regret feedback was saved, recalled and supplied correctly to Gemini. **The seven current ratings did not trigger a regret shield or change the safe-to-spend quota.** Controlled tests separately demonstrate when that rule does change the calculation.

## Evidence and method

| Phase | Evidence | Scope |
| --- | --- | --- |
| Original Mainnet application run | `live-mainnet-2026-11-10`; started 9 November at 18:57:36 UTC, ledger reconciliation at 20:16:15 UTC | Actual application builders, authenticated APIs, Gemini, Tatum, MemWal and Sui Mainnet; three owner-supplied wallets. |
| Six-hour feedback follow-up | `regret-six-hours-2026-11-10`; checks recorded 10 November at 04:45:21 UTC | Seven randomized check-ins on existing created bills, using their original timestamps and creator shares. |
| Additional learning audit | `regret-learning-2026-11-10`; evaluation timestamp 10 November at 04:59:25 UTC | Fresh authenticated recall, current bill reads, actual spending-room calculation, offline ablation and one non-writing Gemini question. |

The [sanitized evidence file](./verification/regret-learning-evidence.json) records results, source SHA-256 hashes and all 37 public application transaction receipts. Raw actions, complete memory text, request results and resumable state remain in ignored local `.live-verification/<run-id>/` directories. Those local artifacts contain private financial context and should not be published automatically.

The tests used local private-key adapters to sign through the application's existing implementation. They did not create a replacement mock payment service or seed runtime fixtures. Browser-extension approval popups were not automated. The separate browser checks use intercepted visual fixtures and cannot sign or send transactions.

The latest audit performed no financial execution or memory writes. Its temporary Quiet Memory grants authenticated reads; the Gemini request explicitly disabled automatic execution and automatic memory creation.

## Mainnet application results

| Check | Observed result |
| --- | --- |
| Mandatory onboarding | Three genuine owned MemWal accounts created, delegate permissions authorized, profiles registered and actual verification-wallet contacts saved. |
| Application transactions | **37 successful transactions:** 28 owner-wallet transactions and nine dedicated-executor transactions. |
| Bills | Seven fully settled bills: three manual creator rotations, one upfront-funded bill, three agent-created bills. |
| Debtor payments | Fourteen settled debtor shares, including six funded incoming-agent payments. |
| Internal transfer volume | **0.220000 USDC**, transferred between the supplied wallets. This is transfer volume, not revenue or merchant spending. |
| Saved preference applied | A recalled explicit funding preference caused an upfront requirement on a real bill; the debtor funded it, the creator activated it, and the remaining share settled. |
| Funded Autopilot | Each owner funded 0.10 USDC, with a 0.03-USDC per-action cap, 0.10-USDC daily limit, one-day expiry and only the other two verification wallets as payees. |
| Dedicated executor | Three bill creations and six incoming-share settlements. Each incoming payment spent 0.01 USDC from its debtor's allowance. Creation receipts recorded zero USDC spent. |
| Cooldown | Three actual 0.01-USDC deposits into 24-hour vaults. Unsigned early-withdrawal preparation failed with Move abort 101. |
| Memory SDK | Committed writes, recall, SDK analysis and namespace restore completed for all three accounts. Final original-run recalls rejected no settlement evidence. |
| Quiet Memory | Owner-approved temporary grants were used for the real signed API requests. This does not grant permanent wallet spending authority. |
| Ordinary chat | Pending-question text was absent from the final original-run memory inventories. The later regret-summary question also produced no memory. |

All seven bill objects were read again during the latest audit, and all participants remained settled. This is a check of the run's known bill set, not an assertion that the verifier discovers every transaction in a wallet's entire history.

### Asset reconciliation

Each verification wallet began with 1 USDC and 0.5 SUI. At the original ledger audit:

| Wallet | Wallet USDC | Agent allowance USDC | Cooldown USDC | Wallet SUI |
| --- | ---: | ---: | ---: | ---: |
| A | 0.950000 | 0.080000 | 0.010000 | 0.473862160 |
| B | 0.890000 | 0.080000 | 0.010000 | 0.476501082 |
| C | 0.890000 | 0.080000 | 0.010000 | 0.475156016 |
| **Total USDC** | **2.730000** | **0.240000** | **0.030000** | — |

The three locations reconcile to the original **3.000000 USDC**. The executor's USDC balance was unchanged; it supplied gas rather than the debtors' payment funds. The regret follow-up did not change wallet, allowance or cooldown balances. These are historical snapshots, not a guarantee that the allowances remain unexpired today.

### Failures found and recovery verified

1. **USDC address balances were missed by coin-only selection.** The shared transaction builder was corrected to redeem a real address-balance shortfall into a coin within the sender-signed transaction. The subsequent live settlement, allowance and cooldown operations passed. Native-USDC and reserve checks remained in place.
2. **An Autopilot response was interrupted after financial work had already occurred.** Recovery queried the original request's on-chain receipt rather than creating a new financial intent. Confirmed shares were not paid again.
3. **Gemini connection/503 errors interrupted incoming processing.** Confirmed-event retries through the real HMAC-protected event endpoint skipped completed work and settled the remaining eligible share. No signed execution mutation was automatically retried by the transport.
4. **Incoming processing lengthened the initiating response.** It was moved behind the confirmed response through Next.js `after`, with two recipient contexts overlapping and executor signing serialized within a server process. Later B/C creation responses took 106.940 and 85.972 seconds. These two local measurements are not a latency benchmark or a production availability guarantee.

## Regret check-in verification

The owner explicitly requested the six-hour delay and random ratings for the existing verification history. The application now enforces six hours in its shared rule, API and UI. Original purchase dates and the separate contract-enforced 24-hour cooldown were preserved.

| Owner | Original created bill | Assigned rating | Intensity |
| --- | --- | --- | ---: |
| A | Live Autopilot A | Worth It | 0 |
| A | Live upfront verification | Worth It | 0 |
| A | Live A live-mainn | Regretted | 2 |
| B | Live Autopilot B | Regretted | 4 |
| B | Live B live-mainn | Worth It | 0 |
| C | Live Autopilot C | Worth It | 0 |
| C | Live C live-mainn | Regretted | 2 |

Every check-in used its creator's actual share, not the whole bill. No standalone purchases existed in the source history; none were invented. The server re-read each bill before accepting its feedback.

The seven ratings committed **14 facts**: one `SOLVENCY_REGRET_V1` and one joined `SOLVENCY_CASHFLOW_V1` per check-in. Three additional provenance notes identify the randomized verification and new policy. There were **17 additional committed blobs** altogether.

| Wallet | Original readable blobs | After check-ins | Readable ratings |
| --- | ---: | ---: | ---: |
| A | 28 | 35 | 3 |
| B | 36 | 41 | 2 |
| C | 35 | 40 | 2 |
| **Total** | **99** | **116** | **7** |

These are distinct recalled blob counts, not a count of Gemini training examples or application transactions. Randomized ratings verify plumbing and provenance; they do not establish actual consumer preferences.

## Is the application learning from regret?

### Persistence and contextual use: verified

The additional audit made fresh signed reads from all three actual accounts. It then asked A's agent to summarize the saved ratings without changing anything. The response used **`gemini-3.5-flash-lite`** and correctly listed A's three bill titles, verdicts and intensities. All three actual regret blob IDs were present in the returned context provenance. Gemini also correctly identified the ratings as owner-authorized randomized verification feedback.

The action was `none`, execution was absent, and `createdMemories` was empty. A subsequent full recall had exactly the same blob-ID inventory. This is direct evidence that saved feedback reached the real model without saving the question. It is one successful case, not a general explanation-accuracy benchmark.

### Current spending recommendation: unchanged

The verifier called the actual [spending-room implementation](../src/lib/financial-insights.ts) three ways: with archived pre-check-in memories, with fresh current memories, and with the current regret/cash-flow records removed from an in-memory copy. It held the audited profile balances, reserves and known unpaid shares constant.

| Wallet | Balance | Reserve | Known unpaid | Before quota | After quota | Current shield |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0.95 | 0.10 | 0 | 0.85 | 0.85 | 0 |
| B | 0.89 | 0.10 | 0 | 0.79 | 0.79 | 0 |
| C | 0.89 | 0.10 | 0 | 0.79 | 0.79 | 0 |

Amounts are USDC. The ablated calculation produced the same quotas. At the actual evaluation time, no rating matched the local purchase-hour window.

The script also evaluated the function at a matching hour in the following 24 hours, with unchanged data. This was **an offline time replay**, not a future live outcome: it changed no clock, memory or chain state. A had three matching samples but only one regret. B and C had two samples each. The rule requires at least three samples, at least two regrets and at least a two-thirds regret rate. None qualified.

### Ability to change recommendations: verified in controlled tests

The existing regression tests exercise qualifying and nonqualifying cases:

| Controlled fixture | Actual function result |
| --- | --- |
| 100-USDC balance, 20 reserve, 10 unpaid, fewer than three qualifying ratings | No regret shield; 70 available before a qualifying shield. |
| Same balance and obligations; three qualifying 30-USDC regretted purchases | 30 shield; quota 40. |
| Same ratings plus two joined higher historical check-in balances | 37.5 shield; quota 32.5. |
| Latest ratings revised so only one regret remains | Pattern removed; shield zero. |
| Insufficient joined cash-flow records | No elasticity increase. |
| Wrong owner, invalid early timing, stale data, duplicate ratings and local-hour differences | Tested filtering/deduplication and time-window behavior. |

These are test-only fixture amounts. They were not written into the users' Walrus accounts. The implementation also caps the shield by available funds and checks exact micro-USDC conservation.

**Assessment:** the feedback storage, recall, model context and deterministic recommendation paths work. The live dataset has not demonstrated a regret-driven quota reduction, merchant-specific prediction, improved financial outcomes or Gemini model training. The current formula retains category and intensity for context but does not weight its pattern count by intensity or train category-specific models. A genuine-user evaluation would be needed to establish practical benefit.

### Payment-learning boundary

The run demonstrates real receipts being remembered and an explicit recalled funding policy changing a real bill. It does **not** demonstrate adaptive repayment-risk thresholds changing on this history: the tiny 0.01–0.02-USDC shares are below the default 40-USDC observation threshold. Controlled tests cover slow/fast histories, minimum samples and explicit policy overrides. This distinction prevents an explicit user preference from being presented as an independently learned credit score.

## Automated validation and limits

| Validation | Result and scope |
| --- | --- |
| `npm run typecheck` | Passed after the six-hour implementation. |
| `npm run lint` | Passed after the six-hour implementation; the new read-only audit script was also linted. |
| `npm test` | 127 passed after the six-hour change; the original run had 126. |
| Targeted Playwright checks | Four passed; fixtures are isolated from live signing. |
| `npm run build` | Passed after stopping dev at the six-hour release. |
| Additional targeted learning tests | 39 passed during this documentation review. These overlap the 127-test suite and are not 39 additional unique tests. |
| Published application evidence | 37 receipts and the known seven bills reconciled; current audit re-read the bills. |
| Credential-value scan | No configured credential values found in the reviewed report artifacts. |

No production application code or Move source changed during the blog/audit work. A production rebuild and Move build/test were therefore not repeated for documentation alone. Historical Move validation is recorded in [CONTRACT_VERIFICATION.md](../CONTRACT_VERIFICATION.md) and [MOVE_DEPLOYMENT.md](../MOVE_DEPLOYMENT.md); it should not be mistaken for a fresh Move execution in this audit.

The following are outside the demonstrated result:

- A positive withdrawal after the full 24-hour cooldown maturity.
- All public-preference and unanimous group-convention flows on Mainnet.
- A provisioned production Tatum Notifications subscription. The verified endpoint accepted confirmed-event delivery from the owner-authorized runner.
- Browser-wallet popup behavior, production Vercel deployment, serverless load, crash-proof background delivery or a durable distributed queue.
- Exhaustive security analysis, all authorization/revocation combinations, prediction accuracy or financial benefit for real consumers.

## Reproduction

The drivers reuse the application's implementation:

- [Original application verifier](../scripts/verify-live-application.mjs) and its [operator guide](../LIVE_APPLICATION_VERIFICATION.md).
- [Six-hour check-in driver](../scripts/verify-live-regret-checkins.mjs), with persisted random assignments and resumable commit results.
- [Read-only learning audit](../scripts/verify-regret-learning.mjs), which restricts worker operations to snapshots, temporary read authorization and non-writing recall/chat.

From the repository, with the existing local run evidence:

```powershell
# Pure calculation against archived evidence; no network request.
node --import tsx scripts/verify-regret-learning.mjs --run-id regret-learning-offline-review

# Actual regression tests, including positive and negative learning cases.
node --import tsx --test tests/financial-insights.test.ts tests/behavioral-memory.test.ts tests/agent.test.ts
```

With the application running and the same wallets locally configured, the read-only live mode is:

```powershell
node --import tsx scripts/verify-regret-learning.mjs --live --ask-gemini --run-id regret-learning-live-review
```

That mode uses authenticated Mainnet and memory reads plus a Gemini request; it can consume provider quota. The audit is intentionally tied to this recorded dataset and expects the observed unchanged quotas. Later genuine history may correctly change the result and require a new assessment. The published sanitized summary alone cannot replace the ignored private source artifacts for a full local replay.

Do not rerun the original mutating verification merely to read this report. It involves real funds, signatures and durable memory and requires its own owner authorization and configured limits.

## Public application transaction receipts

The following digests identify all 37 successful application transactions in the original run. They can be looked up on a Sui Mainnet explorer or through the configured read client. The machine-readable evidence includes their checkpoints. Wallet labels distinguish account owners from the dedicated executor; these rows are not additional transactions created by the documentation audit.

| # | Signer | Owner | Verified operation | Transaction digest |
| --- | --- | --- | --- | --- |
| 1 | Wallet A | A | Create owned MemWal account | `37D9MqATxNXrD7CbRFG6BoRRk3prL62FLQ3UdJub7kpu` |
| 2 | Wallet A | A | Authorize configured MemWal delegate | `9Vd5VCXYodVavN7oYJuGQKcyeVZFWh7qqp1vSX5HaUkK` |
| 3 | Wallet A | A | Register profile / save actual verification-wallet contacts | `AT4asqu5LFzRZNufgqLPj3fsqHiw1pxSLDNPnfLpUHVG` |
| 4 | Wallet B | B | Create owned MemWal account | `8cnRyY3qNPYxWAa25thG9aeJrBfvPgAG2NozMa4z14SA` |
| 5 | Wallet B | B | Authorize configured MemWal delegate | `Gz8KW5LkhnvHEwnNHuAP9jxkGciPxAMy2LHAQPMAbNec` |
| 6 | Wallet B | B | Register profile / save actual verification-wallet contacts | `9ZhoRPymT3PrBYAc5CT4tvdwCEG3rkrN71j3bBaKFuJd` |
| 7 | Wallet C | C | Create owned MemWal account | `6vToaBuve8fzqht5xBejU5YQTsXuL4rDyfxv6dS1fLu9` |
| 8 | Wallet C | C | Authorize configured MemWal delegate | `DyJysf4xEQ66pycxTNDRvgQMUbswWNF3HjwUAnmiR2Tz` |
| 9 | Wallet C | C | Register profile / save actual verification-wallet contacts | `CggVLtDsXWMKBGCgXZuM9Nar8HUdjqmTeRXTZ92XY1PG` |
| 10 | Wallet A | A | Approve Gemini-prepared split after bounded review | `oV4Q8korSLQjizyDA8nRUVEpSSVA8H5QCqkBTSpCeip` |
| 11 | Wallet B | B | Pay real split share | `DGPZrHFrfxhq7YjbKEN2EA8eYMVV5vTWzUNGAUfezCzG` |
| 12 | Wallet C | C | Pay real split share | `7RzSuX1LeKMt9J7PVuA3Z8jUyP1Jx3zT7GBDUtCepVFa` |
| 13 | Wallet B | B | Approve Gemini-prepared split after bounded review | `7HgmbNjNAyabfZPNxF1W3yJJ7vyHqHuPWuNuHGcPAvgb` |
| 14 | Wallet A | A | Pay real split share | `3Fu34Be6TaDndBDW9ZoXn3R1Vw2xoGpjDBneASyi7Yis` |
| 15 | Wallet C | C | Pay real split share | `6qKZstarGeSLE6bVSGdKQDPUQM96bHTu2WQMhVcF6vRa` |
| 16 | Wallet C | C | Approve Gemini-prepared split after bounded review | `F4irh6WqH4xfobnfXnZi6Bicfn7a9rodWbGs64xFLrys` |
| 17 | Wallet A | A | Pay real split share | `4cEPHz8Znu229t3dhW377ubTW4toZoJWA2UbA4sjvCbi` |
| 18 | Wallet B | B | Pay real split share | `DCo3FCYepupJ4AFs7WipV5D4oBPk9cFhr2LN7gMwNpnK` |
| 19 | Wallet A | A | Approve Gemini-prepared split after bounded review | `91L5VrMVsVg7D4GgcjzozkG8iDd9LNxx8j6xFRWVQFeD` |
| 20 | Wallet B | B | Fund real upfront share | `CiDyLpECo2H3Nm87v4pGaZbqDiLEdqm16tVwFBtsp3o` |
| 21 | Wallet A | A | activate_group_split | `5hVwS5vzfbqDjzszjC2LA6RwRZUa2qvkdZDPWnneHbJV` |
| 22 | Wallet C | C | Pay real split share | `HLd1hoNcESEKnFr8KCyy4qLjDk2ngKzCsFRUSJA2hA3y` |
| 23 | Wallet A | A | Fund 0.10 USDC bounded Autopilot allowance | `715ZjEp9CPgzdQhLX3SAjmsQ88oharQgQshcYbcQQrwP` |
| 24 | Wallet A | A | Approve Gemini-prepared 24-hour cooldown | `2h2UE2vPrX6Q18Tdrg4JXr6wPCR23AzZTKVToaopV6Fj` |
| 25 | Wallet B | B | Fund 0.10 USDC bounded Autopilot allowance | `FdVP62WVtbMrVyNhPRwmQuUFQnh7k6mtK2TnAcCUk8H9` |
| 26 | Wallet B | B | Approve Gemini-prepared 24-hour cooldown | `5vAaTgMc2fWr9EHt2R8c5jnCty1UBUaADSzKaq12MeSw` |
| 27 | Wallet C | C | Fund 0.10 USDC bounded Autopilot allowance | `3E9FJtXpS19Sm99FcA26hhoBJTxayzxxdA43PhMmUAC9` |
| 28 | Wallet C | C | Approve Gemini-prepared 24-hour cooldown | `FXaNGqhUWh4fVNyWBzsjMNqY4z8F541qEMxBpGoYsfSG` |
| 29 | Dedicated executor | A | Create bill | `Ewyv7YqhyHTzYWQpgnRpNXQVLB9SvJoem3aXQSZrRPt1` |
| 30 | Dedicated executor | A | Settle incoming share | `8VhGvXvo6fQRTCVHctKBK4MLbdvCo5hSLDcM9fYPJikE` |
| 31 | Dedicated executor | A | Settle incoming share | `HHsnxNMDsCsBDtFCMvrVZjJzKX3pWeQdQX69MLwviPKF` |
| 32 | Dedicated executor | B | Settle incoming share | `3Qx4qC4btouga26m8ArWeDcLPBVQReNjqt9Wt5kbG3dh` |
| 33 | Dedicated executor | C | Settle incoming share | `B3H9gHWgGDYcU1FGZgqw3fWB21cP5DvZ8eLyAv4K7KpK` |
| 34 | Dedicated executor | B | Settle incoming share | `CmBVsH5dLQr72WJCAenoqUspxdJ6uo8jTjDWJbmLUbmv` |
| 35 | Dedicated executor | C | Settle incoming share | `8UZvbQCArjqV5gFA9ERYeyxt5wyccpawkzGLLNspB1M5` |
| 36 | Dedicated executor | B | Create bill | `FQxJdkj1w2ev9Q3hDAtTsGYohbLdEUGZecx7utt9iE5M` |
| 37 | Dedicated executor | C | Create bill | `Aawx2cisJBBXrtQoH7jfXW4XqxphwThDCRgPY3PQCCFF` |
