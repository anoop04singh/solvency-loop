# Using SolvencyLoop

## Your first visit

The home page explains the app and lets you explore **Split**, **Pause** and **Remember** without connecting a wallet. Select **Open app** to enter the workspace at `/app`. An old shared bill link still opens the correct workspace.

1. Connect your Sui Mainnet wallet. Keep SUI available for network fees. The app checks for an existing owned profile and MemWal account before offering account creation.
2. Create your MemWal account if you do not already have one. Review the account-wide memory access disclosure, select the consent checkbox, then authorize the app with your wallet.
3. Choose a display name and the USDC reserve you want to keep available when locking funds. Save your profile. No contacts, example data or minimum memory count are required.

The workspace opens only when profile ownership, the active MemWal account, its app authorization and the profile link match. The app never needs your wallet private key. Profile information, contacts and financial records are public on Sui.

## Your workspace

- **Today:** your actual USDC balance and outstanding amounts in the currently loaded bills.
- **Split & settle:** create an expense, open a shared bill, fund a deposit or pay your own share.
- **Protect:** place USDC in a 24-hour cooldown vault, preserving the reserve recorded in your profile.
- **Reflect:** save notes and contact-specific payment preferences in your own MemWal account.
- **Account:** edit your profile, add or remove contacts and manage the app's memory access.

The header and footer open **Your account & on-chain details**, a drawer containing the current checkpoint, wallet/profile references, account permissions, recalled memory references and recent activity. Opening it does not send a transaction or recall private memories automatically.

The background gently follows your activity: green after success, yellow while processing or awaiting confirmation, and red when something needs attention. Always read the accompanying message for the exact result; a confirmed payment can still need a refresh or memory update. The small status pill pauses/resumes the fog. Reduced-motion or data-saver settings use a still background, and animation stops while the tab is hidden.

## Create and share a real expense

1. Choose **Create an expense**. Enter its name and total in USDC.
2. Add 1–64 other participants from saved contacts or enter their actual wallet addresses.
3. Choose **Split equally**, including yourself, or **Custom amounts**. In custom mode, your share is the amount remaining after the other participants' shares. Every share must be positive.
4. Select upfront funding when needed. The **With memory** control applies only your recalled payment preferences. **Standard** uses the same bill without those preferences. The displayed count is the number actually recalled in this session.
5. Review the exact shares and approve the transaction through your wallet. Arithmetic uses integer micro-USDC; one USDC is 1,000,000 units.
6. Copy the bill link and share it with the participants yourself. A recipient must complete their own onboarding and be a participant in the bill before paying.

An upfront deposit remains in escrow until the creator activates a fully funded bill. Pending deposits can be refunded after cancellation or the 24-hour funding deadline. Standard shares settle directly to the creator in native Circle USDC. SUI pays gas.

Bills load in bounded history pages. Choose **Load earlier bills** to scan more history, or open a bill by link/ID. Overview amounts describe loaded bills rather than claiming a complete lifetime balance.

If confirmation is uncertain, use **Check confirmation**. Signed transaction execution is never retried automatically. If a transaction succeeds but account refresh fails, refresh before making another transaction. If its memory update fails, use the memory-only retry; paying again is unnecessary.

## Save what you actually want to remember

In **Reflect**, write a note, extract facts from it, or save an upfront-funding threshold for a saved contact. Recall your memories before applying preferences to a new expense. The newest explicit threshold applies; no example behavioral rules are generated. Older demo-prefixed rules are ignored, while existing stored data is retained.

You may import confirmed settlement history into your own memory account. Event identifiers prevent duplicate observations on repeated imports. **History & recovery** also offers index restoration when stored memories are missing from search.

Memory requests require signatures over the exact action, payload, timestamp, nonce and origin. The backend checks current profile/account ownership, active status and delegate authorization before constructing a scoped memory client.

## Protect funds and control access

Choose the USDC amount to lock in **Protect**. The contract verifies the reserve and enforces a 24-hour cooldown. Only the original owner can withdraw after maturity.

You can revoke app memory access in **Account**. This closes the financial workspace until authorization is restored. Existing members retain a recovery panel for cancellation, eligible escrow refunds and matured withdrawals, using their actual owned profile and linked account. Revocation cannot erase plaintext or decryption keys already obtained by a delegate.

## Visual design

The consumer interface follows the supplied warm alabaster reference: centered stages, generous spacing, bold real balances, quiet pill controls and an inspectable proof drawer. Blur is confined to navigation and overlays. Motion respects the system's reduced-motion preference. The reference's example users, balances, memory counts and transaction handlers are not used.
