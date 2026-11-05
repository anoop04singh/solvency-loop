# Using SolvencyLoop

The workspace opens on **Agent**, powered by Gemini and your owned Walrus memory. Type your actual request and answer any clarification. Without funded agent authority, review the proposal before approving a wallet transaction or signed memory update. Optional **Autopilot** adds separately consented quiet memory, a limited USDC budget, incoming-share handling and shared preferences/conventions. See [AUTOPILOT_GUIDE.md](./AUTOPILOT_GUIDE.md) for setup and controls. **Draft only** retains review even with an allowance. **Split Canvas**, **Cooldown Vault** and **Escrow Desk** preserve the manual features described below. Read [AGENT_GUIDE.md](./AGENT_GUIDE.md) for data sharing and the server-only `GEMINI_API_KEY` setup. Restored conversation is context; it cannot replay an old action.

## Your first visit

The home page explains the app and lets you explore **Split**, **Pause** and **Remember** without connecting a wallet. Select **Open app** to enter the workspace at `/app`. An old shared bill link still opens the correct workspace.

1. Connect your Sui Mainnet wallet. Keep SUI available for network fees. The app checks for an existing owned profile and MemWal account before offering account creation.
2. Create your MemWal account if you do not already have one. Review the account-wide memory access disclosure, select the consent checkbox, then authorize the app with your wallet.
3. Choose a display name and the USDC reserve you want to keep available when locking funds. Save your profile. No contacts, example data or minimum memory count are required.

The workspace opens only when profile ownership, the active MemWal account, its app authorization and the profile link match. The app never needs your wallet private key. Profile information, contacts and financial records are public on Sui.

Once onboarding is ready, choose quiet memory or individual approvals before the first learning refresh. Quiet memory uses one explicit wallet grant for up to one hour; individual mode signs each request. Learning synchronizes confirmed payment history and recalls your own memory to calculate a personal spending suggestion. Zero memories is a valid starting point. A canceled or failed request leaves the suggestion unavailable and shows a retry; the app never substitutes example data or repeatedly opens prompts. Wallet changes start a separate session. See [LIFECYCLE.md](./LIFECYCLE.md) for the creator-to-counterparty loop and [AUTOPILOT_GUIDE.md](./AUTOPILOT_GUIDE.md) for the optional delegated path.

## Your workspace

- The unbordered **Safe to spend today** metric stays above the workspace, with your wallet balance and allocation strip.
- **Split a Bill:** prepare and inspect the full bill card, or use the guided popup to enter one detail at a time.
- **Regret check-in:** record a purchase and rate it after 48 hours using choices and a regret intensity scale.
- **Settle Shares:** open a shared bill, fund an upfront deposit or pay your own share. The counter reflects your unsettled shares in loaded, uncancelled bills.
- The **settings drawer** links to **Vaults & protection**, **Memory & preferences**, **Profile & contacts** and account refresh. These tools keep the three main tabs focused.

The header settings icon and footer **Inspect Walrus Memories & Wallet Addresses** link open the **On-Chain Setup & Walrus Memory** drawer. It combines saved contacts, actual loaded memories, checkpoint and account references. The center header pill shows real memory readiness/count and refreshes your learning. There is no memory-off comparison. Opening the drawer itself sends no transaction or memory request.

Use **Add contact** or the contact edit buttons to prepare changes in the drawer. Changes stay in a temporary draft until **Save Contacts On-Chain**, review and **Save with my wallet**. Closing the drawer discards unsaved edits. Removing a saved contact does not remove existing bills or memories. Names, wallets and reserve settings are public on Sui; behavioral memory access remains account controlled.

The workspace uses the supplied warm editorial canvas with very subtle fog. Gentle outcome accents follow your activity: green after success, yellow while processing or awaiting confirmation, and red when something needs attention. Always read the accompanying message for the exact result; a confirmed payment can still need a refresh or memory update. The small status pill pauses/resumes the fog. Reduced-motion or data-saver settings use a still background, and animation stops while the tab is hidden. The public landing design is unchanged.

Search contacts by name or wallet in the dropdowns, then explicitly choose the matching entry. Arrow keys and Enter select; Escape closes the list. Editing a selected contact clears it until you choose again. Bill search suggests loaded bills and also accepts a pasted shared link or object ID.

## Create and share a real expense

**Auto-Split** sends your exact description to the signed `/api/smart-split` endpoint, which resolves contacts from your current on-chain profile, synchronizes confirmed history and recalls your own memory. The supported form is `amount at place (amount food, amount drinks) with names`; `for` can replace `at`, `USDC` or `$` may label amounts, and the optional receipt accepts food, drinks/alcohol and other. Use commas or `and` between saved names, optional `@` handles, or a saved canonical wallet. Receipt items must sum exactly to the total, with at most six decimals. Unknown or ambiguous contacts require correction; the app never invents a wallet. This manual parser does not call Gemini; use the Agent composer for natural-language requests. Auto-Split never creates a transaction. Inspect the allocation card and choose **Create Split on Sui Mainnet** for a fresh learning refresh and final review.

Alternatively, enter your own Food and Drinks amounts in the empty boxes; their exact sum becomes the bill total. Blank categories are omitted. Drinks are treated as alcohol for saved exclusions. Then choose the bill name and actual participants. The guided editor also supports other receipt categories, selected participants and custom shares. No preset expense, amount or participant is supplied. Switching tabs preserves your entered draft; switching wallets clears it.

1. Choose **Create an expense**. The popup asks one question at a time: name, total, split style, then people.
2. Add 1–64 other participants from searchable saved contacts or enter their name and actual wallet in separate steps.
3. Choose equal, receipt-item or custom allocation. Receipt items have a food/alcohol/other category, an amount and selected participants. Item amounts must add up exactly. Custom mode leaves your share as the remaining amount. Every share must be positive.
4. Select any manual upfront deposits. Choose **Recall & review** to sign a fresh learning refresh. Saved alcohol exclusions affect alcohol items. Adaptive deposit suggestions use independently verified settlement history. Failed recall stays on this step; there is no silent fallback or fabricated history.
5. Review the exact amounts, exclusions and funding reasons. Only **Create expense** starts wallet approval. Arithmetic uses integer micro-USDC; one USDC is 1,000,000 units. Back changes a choice; Escape or Cancel dismisses the draft when no request is running.
6. Copy the bill link and share it with the participants yourself. A recipient must complete their own onboarding and be a participant in the bill before paying.

An upfront deposit remains in escrow until the creator activates a fully funded bill. Pending deposits can be refunded after cancellation or the 24-hour funding deadline. Standard shares settle directly to the creator in native Circle USDC. SUI pays gas.

Bills load in bounded history pages in **Settle Shares**. Choose **Load earlier bills** to scan more history, or open a bill by link/ID. Summary amounts describe loaded bills rather than claiming a complete lifetime balance.

If confirmation is uncertain, use **Check confirmation**. Signed transaction execution is never retried automatically. If a transaction succeeds but account refresh fails, refresh before making another transaction. If its memory update fails, use the memory-only retry; paying again is unnecessary.

To pay, choose **Pay Share**, review the amount, then choose **Continue to wallet**. The app first verifies your account, loads native-USDC coins in pages of at most 50 and builds the transaction. The wallet prompt appears after those checks succeed. Preparation errors are displayed in the review card; they do not mean a payment was submitted.

**Settle My Pending Shares** reviews active, unpaid shares belonging to your connected wallet across loaded bills. Select 1–20 bills, inspect the exact combined amount, then continue to wallet approval. Each bill is read again before building one atomic transaction using the existing contract function. A stale, paid, inactive or foreign share stops preparation. Another participant's **Switch wallet** label cannot pay from your wallet. Upfront funding, activation, cancellation and refunds retain their individual reviewed actions.

## Save what you actually want to remember

In **Memory**, choose **Save a note** for guided category, text and save-method steps. Keep the exact note with rememberAndWait, or extract facts through analyzeAndWait (which invokes SDK analyze and waits for commits). **Set a preference** asks for a saved contact, alcohol inclusion, deposit policy and threshold before a review. Existing manual threshold rules remain manual; older demo-prefixed rules are ignored.

Adaptive deposits default to shares strictly above 40 USDC unless you save another threshold. At least 3 verified qualifying payments are required. The latest 5 payments to you are sampled: an average settlement delay over 7 days suggests upfront escrow; an average at most 24 hours returns to standard settlement. A manual upfront selection or saved always-upfront policy takes priority. A displayed percentage is the observed sample paid within 24 hours, not a predicted trust or repayment guarantee.

Confirmed direct payments and escrow activation automatically record matching settlement events in the signer's own memory account and display actual committed blob references. A creator's next signed session or bill review imports received payments into the creator's own account; a payer's signature never writes there. Event identifiers deduplicate retries and imports. Session refreshes scan at most 20 recent contract events, expose older-history continuation and recall all three namespaces. Continue older pages in Memory & preferences. Recalled claims are checked against successful exact-package Sui events, native-USDC split types, amounts and timestamps before affecting a recommendation. Each recall verifies at most 20 settlement candidates and reports excluded evidence or a bounded sample. **Restore a memory index** runs SDK restore when committed memories are absent from search.

Memory requests require signatures over the exact action, payload, timestamp, nonce and origin. The backend checks current profile/account ownership, active status and delegate authorization before constructing a scoped memory client.

## Protect funds and control access

Choose the USDC amount in the drawer's **Vaults & protection** tool and review the reserve and 24-hour restriction before approving the lock. **Review protection** in a learned regret window and the main protection action in **Regret Check-In** open this same dialog; a learned amount is pre-filled for review. The contract verifies the reserve and enforces the cooldown. Only the original owner can withdraw after maturity.

## Check in after 48 hours

In **Regret check-in**, add an actual purchase through category, merchant, USDC amount and purchase-time steps. These purchase details are self-reported, not proof of an on-chain merchant payment. The server records your local purchase hour/timezone and a fresh live balance/checkpoint in habit_regret. A purchase must be within the past year.

At least 48 hours after the purchase, choose the row's **Worth It** or **Regretted** option. Worth It opens its review; Regretted adds a 1–5 intensity slider before review. Both options remain disabled before the check-in is due. Review before signing. The server independently enforces the delay and owned purchase lookup, then commits the rating and current balance/reserve/checkpoint to habit_regret and cashflow_elasticity. The latest rating per purchase counts once. If the second commit fails, the app reports the partial result; retrying does not count the purchase twice.

The default queue shows unrated purchases, including recent purchases whose actions are still disabled. **Show all purchases** includes previous ratings. Sample counts and the synthesis strip describe actual recalled observations. The full-width protection action opens the same amount and 24-hour vault review used by the protection tool; it never locks funds automatically or promises a zero-gas withdrawal.

The header's spending suggestion is wallet balance minus the registered reserve, loaded unpaid shares and a suggested shield. A high-regret window needs at least 3 check-ins from the last 90 days within one local hour of now, with at least 2 regrets and a regret ratio of at least two-thirds. Its shield is the median regretted purchase amount (upper middle for an even sample). With at least 2 matching cash-flow observations and current balance below 75% of their average balance, the shield increases by 25%, rounded down to micro-USDC. It is capped at the remaining balance. These transparent rules use loaded memory samples; they are not a complete budget, prediction or spending permission. No funds move automatically.

You can revoke app memory access through **Profile & contacts** in the settings drawer. This closes the financial workspace until authorization is restored. Existing members retain a recovery panel for cancellation, eligible escrow refunds and matured withdrawals, using their actual owned profile and linked account. Revocation cannot erase plaintext or decryption keys already obtained by a delegate.

## Visual design

The workspace implements the supplied split, regret/vault and settlement/proof-drawer screens: an 896px header, an unbordered metric, three tabs, a focused 672px workspace and a quiet telemetry footer. The warm canvas, locally bundled Hanken Grotesk, white cards, inset receipt/purchase objects and blue/green/amber badges follow the reference. Each card has one dominant full-width action; row actions are compact, input shortcuts use soft pills and proof utilities stay quiet. Centered popup cards ask one question at a time, with searchable choices, scales, Back, keyboard focus wrapping and pinned action buttons. Motion respects reduced motion. The landing page is unchanged. All amounts, memory counts and checkpoints come from loaded state. Hanken Grotesk is bundled under the SIL Open Font License in `public/fonts/HankenGrotesk-OFL.txt`.
