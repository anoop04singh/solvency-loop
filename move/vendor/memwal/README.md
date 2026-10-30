# MemWal contract dependency

Vendored from [MystenLabs/walrus-memory](https://github.com/MystenLabs/walrus-memory/tree/bbf6b2268f1985bbafbb9f2aab16436fc30da7da/services/contract) at commit `bbf6b2268f1985bbafbb9f2aab16436fc30da7da` (Apache-2.0; see LICENSE). The production account module is unchanged. SolvencyLoop adds only `#[test_only]` fixtures, and pins the manifest's framework to the project's Sui 1.72.2 baseline.

`Published.toml` records the existing original Mainnet package binding reported by the public relayer on 2026-10-30. The manifest uses the current package format, omits legacy address tables, and pins `std` and `sui` to the project's tested framework. This is a dependency on the existing protocol, not a second package to publish. `npm run move:verify-bundle` verifies the offline bundle references it and includes only the application module. Keep dependency verification enabled when deploying; live bytecode/linkage verification requires the operator's authenticated Tatum configuration. Review source, published IDs and lockfile together on upgrades.

