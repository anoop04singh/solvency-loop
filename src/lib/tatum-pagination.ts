// Verified against the fixed Tatum Mainnet GraphQL Address.objects connection.
// This is a per-request maximum, never a cap on the number of pages a caller reads.
export const TATUM_GRAPHQL_MAX_PAGE_SIZE=50;
export function tatumPageSize(limit?:number|null):number {
  if(limit===undefined||limit===null)return TATUM_GRAPHQL_MAX_PAGE_SIZE;
  if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Page size must be a positive safe integer.');
  return Math.min(limit,TATUM_GRAPHQL_MAX_PAGE_SIZE);
}
