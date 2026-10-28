import {
  SuiJsonRpcClient as SuiClient,
  JsonRpcHTTPTransport as SuiHTTPTransport,
} from "@mysten/sui/jsonRpc";

export const TATUM_MAINNET_GATEWAY = "https://sui-mainnet.gateway.tatum.io";

// Native Circle USDC on Sui Mainnet (6 decimals)
export const SUI_MAINNET_USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export const CIRCLE_USDC_MAINNET = SUI_MAINNET_USDC_TYPE;
export const SUI_NATIVE_TYPE = "0x2::sui::SUI";

/**
 * Creates a SuiClient that routes 100% of JSON-RPC requests through Tatum's Mainnet Gateway.
 * In browser contexts, it calls /api/tatum-rpc so the Tatum API key stays protected server-side.
 * In server/node contexts, it hits https://sui-mainnet.gateway.tatum.io directly with x-api-key.
 */
export function createTatumSuiClient(): any {
  const isBrowser = typeof window !== "undefined";

  if (isBrowser) {
    return new SuiClient({
      network: "mainnet",
      transport: new SuiHTTPTransport({
        url: "/api/tatum-rpc",
      }),
    });
  }

  return new SuiClient({
    network: "mainnet",
    transport: new SuiHTTPTransport({
      url: process.env.NEXT_PUBLIC_TATUM_SUI_RPC || TATUM_MAINNET_GATEWAY,
      rpc: {
        headers: {
          "x-api-key": process.env.TATUM_API_KEY || "",
        },
      },
    }),
  });
}

export const tatumSuiClient: any = createTatumSuiClient();

export const executeTatumSuiRpc = executeRawTatumRpc;

/**
 * Direct JSON-RPC helper for raw Tatum RPC telemetry & verification badges
 */
export async function executeRawTatumRpc<T = any>(
  method: string,
  params: unknown[] = []
): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const isBrowser = typeof window !== "undefined";
  const endpoint = isBrowser ? "/api/tatum-rpc" : TATUM_MAINNET_GATEWAY;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!isBrowser && process.env.TATUM_API_KEY) {
    headers["x-api-key"] = process.env.TATUM_API_KEY;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Tatum RPC [${method}] failed: ${json.error.message}`);
  }

  return {
    result: json.result as T,
    latencyMs: Date.now() - start,
  };
}
