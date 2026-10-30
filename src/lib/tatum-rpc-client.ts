import { SuiJsonRpcClient, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { TATUM_MAINNET_GATEWAY } from './config';
export { TATUM_MAINNET_GATEWAY, SUI_MAINNET_USDC_TYPE, SUI_NATIVE_TYPE } from './config';
export function createTatumSuiClient(): SuiJsonRpcClient {
  const browser = typeof window !== 'undefined';
  return new SuiJsonRpcClient({ network: 'mainnet', transport: new JsonRpcHTTPTransport({
    url: browser ? '/api/tatum-rpc' : TATUM_MAINNET_GATEWAY,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (!browser) {
        if (!process.env.TATUM_API_KEY) throw new Error('TATUM_API_KEY is not configured.');
        headers.set('x-api-key', process.env.TATUM_API_KEY);
      }
      return fetch(input, { ...init, headers, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(25_000) });
    },
  }) });
}
export const tatumSuiClient = createTatumSuiClient();
export async function executeRawTatumRpc<T>(method: string, params: unknown[] = []) {
  const start = Date.now();
  const result = await tatumSuiClient.call<T>(method, params);
  return { result, latencyMs: Date.now() - start };
}
