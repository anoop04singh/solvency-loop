# SolvencyLoop conventions

The application was migrated from an AI Builder Vite/Express export to the Next.js 15 App Router requested by the user. The old preview server is no longer active.

- Runtime: Next.js 15, React 19, TypeScript, Tailwind with existing Tatum tokens.
- Read `.claude/skills/tatum/SKILL.md` before changing blockchain integration and `.claude/skills/tatum-design/SKILL.md` before changing UI. These directories are managed; do not edit them.
- No application database or durable local user-state store. Profiles, contacts, splits, and cooldown vaults live in the Sui Move package; behavioral memory uses MemWal/Walrus.
- All Sui traffic must use the fixed authenticated Tatum Mainnet gateway. Browser calls use `/api/tatum-rpc`; server/CLI code uses the shared transport. Keep the pinned MemWal client-injection patch intact and retest it on upgrades.
- Never expose delegate private keys, Tatum keys, or embedding API keys with `NEXT_PUBLIC_*`. Private values belong in ignored `.env.local` or host secrets.
- Only real user-provided canonical Mainnet wallets and native Circle USDC. Test fixtures belong only in tests; no mock fallback data in runtime code.
- Use bigint micro-USDC arithmetic. The Move contract is the authority for payment, escrow, authorization, reserve, and cooldown invariants.
- Memory requests require a wallet personal-message signature over the action/payload, timestamp, nonce, and origin. Do not remove authentication or silently convert relayer failures into empty successful data.
- Check `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and both Move commands when their corresponding code changes. Stop dev before production builds; do not run both against the same .next directory.
- Framework/CLI baseline: official Sui 1.72.2. Commit `Move.lock`; review framework/toolchain changes together.
- No deployment, signing, or live financial transaction is implied by a request to build/test. The user requested deployment instructions and will configure credentials later.

See README.md for setup, deployment, and validation.
