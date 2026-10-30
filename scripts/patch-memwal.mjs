// Pinned compatibility patch: MemWal 0.1.11 otherwise creates its own Sui clients.
// Injecting our client also disables every SDK fallback to public fullnodes.
import fs from 'node:fs';
const root = 'node_modules/@mysten-incubation/memwal/';
const pkg = JSON.parse(fs.readFileSync(root + 'package.json', 'utf8'));
if (pkg.version !== '0.1.11') throw new Error('Review the Tatum client patch before upgrading MemWal.');
const path = root + 'dist/memwal.js';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('this.solvencySuiClient = config.suiClient')) {
  const edits = [
    ['constructor(config) {', 'constructor(config) {\n        this.solvencySuiClient = config.suiClient;'],
    ['const clientCandidates = [];', 'const clientCandidates = [];\n        if (cfg.network !== "mainnet") throw new Error("SolvencyLoop requires a Mainnet MemWal relayer");\n        if (this.solvencySuiClient) clientCandidates.push({ name: "Tatum", client: this.solvencySuiClient });'],
    ['if (cfg.suiTransport === "grpc" && cfg.suiGrpcUrl)', 'if (!this.solvencySuiClient && cfg.suiTransport === "grpc" && cfg.suiGrpcUrl)'],
    ['if (cfg.suiRpcUrl) {', 'if (!this.solvencySuiClient && cfg.suiRpcUrl) {'],
  ];
  for (const [before, after] of edits) {
    if (source.split(before).length !== 2) throw new Error('MemWal patch target changed: ' + before);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}
const types = root + 'dist/types.d.ts';
let declarations = fs.readFileSync(types, 'utf8');
if (!declarations.includes('suiClient?: import("@mysten/sui/client").ClientWithCoreApi;')) {
  declarations = declarations.replace('export interface MemWalConfig {', 'export interface MemWalConfig {\n    /** SolvencyLoop: mandatory injected Tatum client for SEAL sessions. */\n    suiClient?: import("@mysten/sui/client").ClientWithCoreApi;');
  fs.writeFileSync(types, declarations);
}
console.log('MemWal Tatum client injection verified.');
