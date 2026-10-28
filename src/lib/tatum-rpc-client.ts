/**
 * Tatum Sui Mainnet RPC Client
 * Routes all JSON-RPC calls through the Tatum Gateway authenticated with x-api-key
 */

export interface SuiJsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params: unknown[]
}

export interface SuiJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export const CIRCLE_USDC_MAINNET = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

export async function executeTatumSuiRpc<T = unknown>(
  method: string,
  params: unknown[] = [],
  id: number | string = 1
): Promise<SuiJsonRpcResponse<T>> {
  const payload: SuiJsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  }

  const response = await fetch('/api/tatum/sui-rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Tatum Sui RPC request failed [${response.status}]: ${errorBody}`)
  }

  return response.json()
}

export async function getSuiAllBalances(ownerAddress: string) {
  return executeTatumSuiRpc('suix_getAllBalances', [ownerAddress])
}

export async function getSuiDynamicFieldObject(parentId: string, fieldName: unknown) {
  return executeTatumSuiRpc('suix_getDynamicFieldObject', [parentId, fieldName])
}

export async function querySuiEvents(queryFilter: unknown, cursor?: unknown, limit?: number) {
  return executeTatumSuiRpc('suix_queryEvents', [queryFilter, cursor, limit])
}
