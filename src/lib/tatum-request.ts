import { parse, Kind } from 'graphql';
import { TATUM_MAINNET_GATEWAY } from './config';

export const TATUM_GRAPHQL_URL = TATUM_MAINNET_GATEWAY + '/graphql';
export function validateGraphqlPayload(value: unknown): { query: string; variables?: Record<string, unknown>; operationName?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A GraphQL request is required.');
  const p = value as { query?: unknown; variables?: unknown; operationName?: unknown };
  if (typeof p.query !== 'string' || p.query.length > 100_000) throw new Error('Invalid GraphQL query.');
  const operations = parse(p.query).definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1 || operations[0].operation === 'subscription') throw new Error('Exactly one query or transaction operation is allowed.');
  if (operations[0].operation === 'mutation' && (operations[0].selectionSet.selections.length !== 1 || operations[0].selectionSet.selections[0].kind !== Kind.FIELD || operations[0].selectionSet.selections[0].name.value !== 'executeTransaction')) throw new Error('Only signed transaction execution mutations are allowed.');
  if (p.variables !== undefined && (!p.variables || typeof p.variables !== 'object' || Array.isArray(p.variables))) throw new Error('Invalid GraphQL variables.');
  if (p.operationName !== undefined && typeof p.operationName !== 'string') throw new Error('Invalid operation name.');
  return value as ReturnType<typeof validateGraphqlPayload>;
}
export function createTatumRequester(fetcher: typeof fetch, options: { intervalMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}) {
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))), now = options.now || Date.now;
  let queue = Promise.resolve(), lastStart = -Infinity;
  const pending = new Map<string, Promise<Response>>();
  return async (payload: unknown, signal?: AbortSignal): Promise<Response> => {
    const p = validateGraphqlPayload(payload), body = JSON.stringify(p);
    const key = process.env.TATUM_API_KEY;
    if (!key) throw new Error('TATUM_API_KEY is not configured.');
    const read = parse(p.query).definitions.some(d => d.kind === Kind.OPERATION_DEFINITION && d.operation === 'query');
    const execute = async () => {
      const wait = (options.intervalMs ?? 400) - (now() - lastStart); if (wait > 0) await sleep(wait);
      let response!: Response;
      for (let attempt = 0; attempt < 3; attempt++) {
        lastStart = now();
        response = await fetcher(TATUM_GRAPHQL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body, cache: 'no-store', signal: AbortSignal.any([AbortSignal.timeout(25_000), ...(signal && !read ? [signal] : [])]) });
        if (!read || ![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
        const after = response.headers.get('retry-after');
        const minimum = after ? (/^\d+(\.\d+)?$/.test(after) ? Number(after) * 1000 : Date.parse(after) - now()) : 0;
        const delay = Math.max(Number.isFinite(minimum) ? minimum : 0, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
        if (delay > 30_000) break; // Surface long provider limits instead of retrying before Retry-After.
        await response.arrayBuffer(); await sleep(delay);
      }
      return response;
    };
    let work = read ? pending.get(body) : undefined;
    if (!work) {
      work = queue.then(execute);
      queue = work.then(() => {}, () => {});
      if (read) { pending.set(body, work); work.finally(() => pending.delete(body)).catch(() => {}); }
    }
    if (signal?.aborted) throw signal.reason;
    return (await work).clone();
  };
}
export const requestTatumGraphql = createTatumRequester((input, init) => fetch(input, init));
