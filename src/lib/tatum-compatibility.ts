import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiJsonRpcClient, JsonRpcHTTPTransport, type SuiMoveNormalizedType } from '@mysten/sui/jsonRpc';
import { ObjectError, type SuiClientTypes } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID, fromBase58, fromBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import { requestTatumGraphql, TATUM_GRAPHQL_URL } from './tatum-request';

function jsonFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, k === 'id' && typeof v === 'string' ? { id: v } : jsonFields(v)]));
}
function legacyObject(o: SuiClientTypes.Object<{json:true}>) {
  const owner = o.owner.$kind === 'Shared' ? { Shared: { initial_shared_version: o.owner.Shared.initialSharedVersion } }
    : o.owner.$kind === 'Immutable' ? 'Immutable' : o.owner.$kind === 'AddressOwner' ? { AddressOwner: o.owner.AddressOwner } : { ObjectOwner: o.owner.ObjectOwner };
  return { data: { objectId: o.objectId, version: o.version, digest: o.digest, owner,
    content: { dataType: 'moveObject', type: o.type, hasPublicTransfer: false, fields: jsonFields(o.json) } } };
}
export function normalizedType(value: unknown): SuiMoveNormalizedType {
  if (typeof value === 'string') {
    const primitive = { address:'Address',bool:'Bool',u8:'U8',u16:'U16',u32:'U32',u64:'U64',u128:'U128',u256:'U256' } as const;
    if (value in primitive) return primitive[value as keyof typeof primitive];
    throw new Error('Unsupported Move signature type.');
  }
  if (!value || typeof value !== 'object') throw new Error('Malformed Move signature.');
  const t = value as Record<string, unknown>;
  if ('body' in t) {
    const body = normalizedType(t.body), reference = t.reference ?? t.ref;
    return reference === 'mutable' || reference === '&mut' ? { MutableReference: body } : reference === 'immutable' || reference === '&' ? { Reference: body } : body;
  }
  if (t.$kind && !['vector','datatype','typeParameter'].includes(String(t.$kind))) return normalizedType(t.$kind);
  if ('vector' in t) return { Vector: normalizedType(t.vector) };
  if (t.$kind === 'typeParameter' || 'typeParameter' in t) return { TypeParameter: Number(t.index ?? t.typeParameter) };
  if (t.datatype && typeof t.datatype === 'object') {
    const d = t.datatype as { typeName?: string; package?: string; module?: string; type?: string; typeParameters: unknown[] };
    const [address,module,name] = d.typeName?.split('::') || [d.package!,d.module!,d.type!];
    return { Struct: { address: normalizeSuiAddress(address), module, name, typeArguments: d.typeParameters.map(normalizedType) } };
  }
  throw new Error('Unsupported Move signature.');
}
type LegacyCursor = { txDigest: string; eventSeq: string; cursor?: string };
export function createGraphqlCompatibilityClient(): SuiJsonRpcClient {
  const browser = typeof window !== 'undefined';
  const gql = new SuiGraphQLClient({ network:'mainnet', url: browser ? '/api/tatum-rpc' : TATUM_GRAPHQL_URL,
    fetch: async (input, init) => browser ? fetch(input, { ...init, cache:'no-store' }) : requestTatumGraphql(JSON.parse(String(init?.body)), init?.signal || undefined) });
  const core = gql.core;
  const client = new SuiJsonRpcClient({ network:'mainnet', transport: new JsonRpcHTTPTransport({ url:'/api/tatum-rpc', fetch: async () => { throw new Error('Legacy JSON-RPC is disabled. Use the supported Tatum GraphQL client.'); } }) });
  async function query<T>(source: string, variables: Record<string,unknown> = {}): Promise<T> {
    const r = await gql.query<T,Record<string,unknown>>({query:source,variables});
    if (r.errors?.length || !r.data) throw new Error(r.errors?.map(e=>e.message).join('; ') || 'Tatum GraphQL response is missing data.');
    return r.data;
  }
  Object.assign(core, { getChainIdentifier: async () => query<{chainIdentifier:string}>('query { chainIdentifier }') });
  const getObject = async ({id}: {id:string}) => {
    const {objects:[o]} = await core.getObjects({objectIds:[id],include:{json:true}});
    if (o instanceof ObjectError && o.reason === 'notFound') return {error:{code:'notExists',object_id:id}};
    if (o instanceof Error) throw o;
    return legacyObject(o);
  };
  async function transaction(digest: string, events = false) {
    const r = await core.getTransaction({digest,include:{effects:true}}), tx = r.Transaction || r.FailedTransaction;
    const result = {digest:tx.digest,checkpoint:tx.checkpoint,timestampMs:String(tx.timestampMs || ''),effects:{status:{status:tx.status.success?'success':'failure',error:tx.status.error?.message}},rawEffects:tx.effects?.bcs ? Array.from(tx.effects.bcs) : undefined,events:[] as {id:{txDigest:string;eventSeq:string};type:string;parsedJson:unknown}[]};
    if (events) {
      let cursor: string | null = null;
      do {
        const data: {transaction:{effects:{events:{nodes:{sequenceNumber:number;contents:{type:{repr:string};json:unknown}}[];pageInfo:{hasNextPage:boolean;endCursor:string}}}}} = await query('query TransactionEvents($digest:String!,$cursor:String) { transaction(digest:$digest) { effects { events(first:50,after:$cursor) { nodes { sequenceNumber contents { type { repr } json } } pageInfo { hasNextPage endCursor } } } } }',{digest,cursor});
        const page = data.transaction.effects.events;
        result.events.push(...page.nodes.map(e=>({id:{txDigest:digest,eventSeq:String(e.sequenceNumber)},type:e.contents.type.repr,parsedJson:e.contents.json})));
        if (!page.pageInfo.hasNextPage) break;
        if (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor) throw new Error('Transaction event pagination did not advance.');
        cursor = page.pageInfo.endCursor;
      } while (true);
    }
    return result;
  }
  // The facade retains dapp-kit compatibility; all network calls and Core API
  // transaction resolution/SEAL sessions use the authenticated GraphQL transport.
  Object.assign(client, { core,
    getObject,
    multiGetObjects: async ({ids}:{ids:string[]}) => (await core.getObjects({objectIds:ids,include:{json:true}})).objects.map(o=>{if(o instanceof Error) throw o;return legacyObject(o);}),
    getDynamicFieldObject: async ({parentId,name}:{parentId:string;name:{type:string;value:string}}) => {
      if (name.type !== 'address') throw new Error('Only wallet directory fields are supported.');
      const id=deriveDynamicFieldID(parentId,'address',bcs.Address.serialize(name.value).toBytes());
      const r=await getObject({id}); return 'error' in r ? {error:{code:'dynamicFieldNotFound',parent_object_id:parentId}} : r;
    },
    getLatestCheckpointSequenceNumber: async () => String((await query<{checkpoint:{sequenceNumber:number}}>('query { checkpoint { sequenceNumber } }')).checkpoint.sequenceNumber),
    getChainIdentifier: async () => {
      const id=(await query<{chainIdentifier:string}>('query { chainIdentifier }')).chainIdentifier;
      return Array.from(fromBase58(id).slice(0,4)).map(b=>b.toString(16).padStart(2,'0')).join('');
    },
    getAllBalances: async ({owner}:{owner:string}) => {
      const result:{coinType:string;totalBalance:string;coinObjectCount:number}[]=[]; let cursor:string|null=null;
      do { const p=await core.listBalances({owner,cursor}); result.push(...p.balances.map(b=>({coinType:b.coinType,totalBalance:b.balance,coinObjectCount:0})));if(!p.hasNextPage)break;if(!p.cursor||p.cursor===cursor)throw new Error('Balance pagination did not advance.');cursor=p.cursor; }while(true);return result;
    },
    getCoins: async ({owner,coinType,cursor,limit}:{owner:string;coinType?:string;cursor?:string;limit?:number}) => {
      const p=await core.listCoins({owner,coinType,cursor,limit});return {data:p.objects.map(o=>({coinObjectId:o.objectId,balance:o.balance,version:o.version,digest:o.digest,coinType:o.type})),hasNextPage:p.hasNextPage,nextCursor:p.cursor};
    },
    getOwnedObjects: async ({owner,filter,cursor}:{owner:string;filter?:{StructType?:string};cursor?:string}) => {const p=await core.listOwnedObjects({owner,type:filter?.StructType,cursor,include:{json:true}});return {data:p.objects.map(legacyObject),hasNextPage:p.hasNextPage,nextCursor:p.cursor};},
    getCoinMetadata: async ({coinType}:{coinType:string}) => (await core.getCoinMetadata({coinType})).coinMetadata,
    queryEvents: async ({query:q,cursor,limit,order}:{query:{MoveEventType:string};cursor?:LegacyCursor;limit?:number;order?:string}) => {
      if(cursor&&!cursor.cursor)throw new Error('Refresh event history to start a new GraphQL pagination cursor.');
      const p=await core.listEvents({filter:{eventType:q.MoveEventType},limit:limit||50,order:order==='ascending'?'ascending':'descending',...(cursor?.cursor?{cursor:cursor.cursor}:{})});
      const data=p.events.map(e=>({id:{txDigest:e.transactionDigest,eventSeq:String(e.eventIndex)},type:e.eventType,parsedJson:e.json}));const last=data.at(-1);
      return {data,hasNextPage:p.hasNextPage,nextCursor:p.hasNextPage&&last?{...last.id,cursor:p.endCursor}:null};
    },
    getNormalizedMoveFunction: async ({package:pkg,module,function:name}:{package:string;module:string;function:string}) => {
      const {function:f}=await core.getMoveFunction({packageId:pkg,moduleName:module,name});
      return {visibility:f.visibility[0].toUpperCase()+f.visibility.slice(1),isEntry:f.isEntry,typeParameters:f.typeParameters.map(p=>({abilities:p.constraints.map(a=>a[0].toUpperCase()+a.slice(1))})),parameters:f.parameters.map(normalizedType),return:f.returns.map(normalizedType)};
    },
    getNormalizedMoveStruct: async ({package:pkg,module,struct:name}:{package:string;module:string;struct:string}) => {
      const r=await query<{package:{module:{struct:{abilities:string[];typeParameters:{constraints:string[];isPhantom:boolean}[];fields:{name:string;type:{signature:unknown}}[]}}}}>('query ProfileLayout($package:SuiAddress!,$module:String!,$name:String!) { package(address:$package) { module(name:$module) { struct(name:$name) { abilities typeParameters { constraints isPhantom } fields { name type { signature } } } } } }',{package:pkg,module,name});
      const s=r.package.module.struct;if(!s)throw new Error('Move struct not found.'); const ability=(a:string)=>a[0]+a.slice(1).toLowerCase();
      return {abilities:{abilities:s.abilities.map(ability)},typeParameters:s.typeParameters.map(p=>({constraints:{abilities:p.constraints.map(ability)},isPhantom:p.isPhantom})),fields:s.fields.map(f=>({name:f.name,type:normalizedType(f.type.signature)}))};
    },
    getTransactionBlock: async ({digest,options}:{digest:string;options?:{showEvents?:boolean}}) => transaction(digest,options?.showEvents),
    waitForTransaction: async ({digest,options}:{digest:string;options?:{showEvents?:boolean}}) => { await core.waitForTransaction({digest,timeout:60_000,pollSchedule:[0,1000,2500,5000]}); return transaction(digest,options?.showEvents); },
    executeTransactionBlock: async ({transactionBlock,signature}:{transactionBlock:string|Uint8Array;signature:string|string[]}) => {const r=await core.executeTransaction({transaction:typeof transactionBlock==='string'?fromBase64(transactionBlock):transactionBlock,signatures:Array.isArray(signature)?signature:[signature],include:{effects:true}});const t=r.Transaction||r.FailedTransaction;return {digest:t.digest,rawEffects:t.effects?.bcs?Array.from(t.effects.bcs):undefined,effects:{status:{status:t.status.success?'success':'failure',error:t.status.error?.message}}};},
  });
  return client;
}
