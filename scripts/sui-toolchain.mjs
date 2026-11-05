import {existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const workspace=fileURLToPath(new URL('../',import.meta.url));
export const frameworkRevision='bf4073918ed33cfa0b09c500658fa116a774bcfd';
export const toolchains={
 mainnet:{version:'1.82.3',commit:frameworkRevision,env:'SUI_CLI_PATH',hashes:{
  'win32-x64':'d9d7c6887ff44f3ee957b87ab506669bab6aaa638f491cf2a9024ae720edaf8a',
  'darwin-arm64':'861f8833c5c7008c86aca50e925043baa8e04332dcbd846cc6c31ea0eee16be9',
  'darwin-x64':'ea174560d3a6a99d388f06219045d11db7eaba8287f9b840dc016af76635fac5',
  'linux-arm64':'1946a62d579b1c1fe8725d4c5c22b3d75ee0312a97ccc726e54dec8f966bc0e6',
  'linux-x64':'d616d63d90309926cf7f544633c8dd4132f762fdbba555a35c4842cfa4129379'}},
 // The legacy dependency-only verifier was removed from the newer CLI. Keep it
 // isolated from the current VM used for tests and from deployment execution.
 verifier:{version:'1.72.2',commit:'85b460a63fd76a15672bbe4820bde6db78a3cfb8',env:'SUI_VERIFY_CLI_PATH',hashes:{
  'win32-x64':'aed201bf6896ab6f00ac0a0d9849cd58c82856be2598862dcd0ad0b7661e8f8d',
  'darwin-arm64':'07de2c7ee50cef9fa72c601f811e77b4ba6e468260a1eefa6b95298bb4ed29aa',
  'darwin-x64':'9006c5fab9985846c3661ffaec5964ab93328c77924a1e56314c28cf8115094d',
  'linux-arm64':'974d080bf4c263e2332f3b5a3d5f7865df364f1626ecf0c6f2a47ea7bd205f94',
  'linux-x64':'97d6e3a6be8de24c162b18c482606cb63aa7bc96c06eb437888c35b12ff4ee53'}}
};
export function assertVersion(output,role='mainnet'){
 const c=toolchains[role],m=output.trim().match(/^sui (\d+\.\d+\.\d+)-([a-f0-9]{12,40})(?:-dirty)?$/);
 if(!c||!m||m[1]!==c.version||!c.commit.startsWith(m[2]))throw Error('Sui '+c?.version+' from the pinned release is required for '+role+'. Run npm run sui:install.');
}
export function localBinary(role='mainnet') {return join(workspace,'.tools','sui',toolchains[role].version,process.platform==='win32'?'sui.exe':'sui');}
export function resolveSui(role='mainnet'){
 const c=toolchains[role],override=process.env[c.env],candidates=override?[resolve(override)]:[...(existsSync(localBinary(role))?[localBinary(role)]:[]),'sui'];
 for(const binary of candidates){const r=spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true});if(r.status!==0)continue;try{assertVersion(r.stdout,role);return binary;}catch{if(override)throw Error(c.env+' must point to the pinned Sui '+c.version+' binary.');}}
 throw Error('Sui '+c.version+' ('+role+') was not found. Run npm run sui:install. Your global CLI is not changed.');
}
export function assertFrameworkPins(){
 for(const path of ['move/solvency_loop/Move.toml','move/vendor/memwal/Move.toml']){
  const pins=[...readFileSync(join(workspace,path),'utf8').matchAll(/rev\s*=\s*"([a-f0-9]{40})"/g)].map(m=>m[1]);
  if(pins.length!==2||pins.some(p=>p!==frameworkRevision))throw Error('Framework revision mismatch in '+path+'. Review both Move manifests and Move.lock together.');
 }
}
export function invoke(binary,args,options={}){
 const r=spawnSync(binary,args,{cwd:workspace,windowsHide:true,...options});
 if(r.error)throw r.error;
 if(r.status!==0)throw Error('Sui command failed (exit '+r.status+'). '+(r.stderr||r.stdout||'').toString().slice(-7000));
 return r;
}
