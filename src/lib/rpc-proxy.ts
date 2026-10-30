import { TATUM_MAINNET_GATEWAY } from './config';
export const RPC_METHODS = new Set([
  'rpc.discover', 'sui_getChainIdentifier', 'sui_getLatestCheckpointSequenceNumber', 'sui_getCheckpoint', 'sui_getCheckpoints',
  'sui_getObject', 'sui_multiGetObjects', 'sui_getTransactionBlock', 'sui_multiGetTransactionBlocks', 'sui_getEvents',
  'sui_getNormalizedMoveModule', 'sui_getNormalizedMoveModulesByPackage', 'sui_getNormalizedMoveFunction', 'sui_getNormalizedMoveStruct', 'sui_getMoveFunctionArgTypes',
  'sui_getProtocolConfig', 'sui_dryRunTransactionBlock', 'sui_devInspectTransactionBlock', 'sui_executeTransactionBlock',
  'suix_getAllBalances', 'suix_getBalance', 'suix_getCoins', 'suix_getAllCoins', 'suix_getCoinMetadata', 'suix_getTotalSupply',
  'suix_getDynamicFieldObject', 'suix_getDynamicFields', 'suix_getOwnedObjects', 'suix_getReferenceGasPrice', 'suix_getLatestSuiSystemState',
  'suix_queryEvents', 'suix_queryTransactionBlocks', 'suix_resolveNameServiceAddress', 'suix_resolveNameServiceNames',
]);
export function validateRpcPayload(value: unknown) {
  const batch = Array.isArray(value) ? value : [value];
  if (!batch.length || batch.length > 20) throw new Error('RPC batches must contain 1–20 requests.');
  for (const entry of batch) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid JSON-RPC request.');
    const p = entry as Record<string, unknown>;
    if (p.jsonrpc !== '2.0' || typeof p.method !== 'string' || !RPC_METHODS.has(p.method) || !Array.isArray(p.params)) throw new Error('Unsupported or malformed JSON-RPC request.');
  }
  return value;
}
export async function proxyTatumRpc(value: unknown, fetcher: typeof fetch = fetch) {
  validateRpcPayload(value);
  if (!process.env.TATUM_API_KEY) throw new Error('TATUM_API_KEY is not configured.');
  return fetcher(TATUM_MAINNET_GATEWAY, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TATUM_API_KEY }, body: JSON.stringify(value), cache: 'no-store', signal: AbortSignal.timeout(25_000) });
}
