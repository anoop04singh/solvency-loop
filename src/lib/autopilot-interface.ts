import type {SuiMoveNormalizedFunction,SuiMoveNormalizedType} from '@mysten/sui/jsonRpc';
import {canonicalType} from './contract-interface';
import {autopilotConfig} from './autopilot-onchain';
import {contractConfig,memwalConfig} from './config';
import {tatumSuiClient} from './tatum-rpc-client';
export const AUTOPILOT_FUNCTIONS={
 create_agent_directory:[],create_agent_allowance_vault:['P','M','D','C','C','Address','Address','U64','U64','U64','Bool','Bool','Bool','VA','K'],
 configure_agent_vault:['P','M','V','Address','Address','U64','U64','U64','Bool','Bool','Bool','VA','K'],
 top_up_agent_vault:['P','M','V','C','C'],withdraw_from_agent_vault:['V','U64'],revoke_agent_vault:['V'],
 create_group_split_by_agent:['V','M','U64','S','U64','VA','VU','VB','VX','K'],settle_share_by_agent:['V','M','U64','B','VX','K'],
 create_conventional_split_by_agent:['V','M','U64','GR','S','U64','VB','VX','K'],
 activate_split_by_agent:['V','M','U64','B','VX','K'],protect_by_agent:['V','M','U64','U64','VX','K'],
 create_public_preferences:['P','M','D','Bool','Bool','K'],update_public_preferences:['P','M','F','Bool','Bool','K'],revoke_public_preferences:['F'],
 create_group_convention:['P','M','D','S','VA','VU','K'],consent_group_convention:['P','M','D','G','Bool','K'],revoke_group_consent:['G'],
} as const;
export function autopilotParameters(name:keyof typeof AUTOPILOT_FUNCTIONS,autoOrigin:string,coreOrigin:string,memoryOrigin:string):SuiMoveNormalizedType[]{
 const struct=(address:string,module:string,name:string,args:SuiMoveNormalizedType[]=[]):SuiMoveNormalizedType=>({Struct:{address,module,name,typeArguments:args}}),ref=(v:SuiMoveNormalizedType,mut=false):SuiMoveNormalizedType=>mut?{MutableReference:v}:{Reference:v};
 const t:SuiMoveNormalizedType={TypeParameter:0};
 const map:Record<string,SuiMoveNormalizedType>={P:ref(struct(coreOrigin,'core','UserProfile')),M:ref(struct(memoryOrigin,'account','MemWalAccount')),D:ref(struct(autoOrigin,'autopilot','AgentDirectory'),true),V:ref(struct(autoOrigin,'autopilot','AgentAllowanceVault',[t]),true),C:struct('0x2','coin','Coin',[t]),B:ref(struct(coreOrigin,'core','GroupSplitEscrow',[t]),true),F:ref(struct(autoOrigin,'autopilot','PublicSocialProfile'),true),G:ref(struct(autoOrigin,'autopilot','GroupConvention'),true),GR:ref(struct(autoOrigin,'autopilot','GroupConvention')),S:struct('0x1','string','String'),K:ref(struct('0x2','clock','Clock')),VA:{Vector:'Address'},VU:{Vector:'U64'},VB:{Vector:'Bool'},VX:{Vector:'U8'}};
 return [...AUTOPILOT_FUNCTIONS[name].map(k=>map[k]||k as SuiMoveNormalizedType),ref(struct('0x2','tx_context','TxContext'),true)];
}
export function assertAutopilotInterface(name:keyof typeof AUTOPILOT_FUNCTIONS,fn:SuiMoveNormalizedFunction,autoOrigin:string,coreOrigin:string,memoryOrigin:string){
 const expected=autopilotParameters(name,autoOrigin,coreOrigin,memoryOrigin),generic=AUTOPILOT_FUNCTIONS[name].some(k=>['V','C','B'].includes(k));
 if(fn.visibility!=='Public'||fn.return.length!==0||fn.typeParameters.length!==(generic?1:0)||fn.parameters.length!==expected.length||fn.parameters.some((p,i)=>canonicalType(p)!==canonicalType(expected[i])))throw Error('Autopilot contract argument/type mismatch: '+name+'. Deploy the compatible extension before enabling autopilot.');
}
let cached:{key:string;promise:Promise<void>}|null=null;
export async function verifyAutopilotInterface(){
 const c=autopilotConfig();if(!c)throw Error('Autopilot is not configured.');const core=contractConfig(),memory=memwalConfig(),key=[c.packageId,c.origin,core.packageId,memory.packageId].join(':');
 if(cached?.key===key)return cached.promise;
 const promise=(async()=>{for(const name of Object.keys(AUTOPILOT_FUNCTIONS) as (keyof typeof AUTOPILOT_FUNCTIONS)[]){const fn=await tatumSuiClient.getNormalizedMoveFunction({package:c.packageId,module:'autopilot',function:name});assertAutopilotInterface(name,fn,c.origin,core.packageId,memory.packageId);}})();
 cached={key,promise};try{await promise;}catch(e){cached=null;throw e;}
}
