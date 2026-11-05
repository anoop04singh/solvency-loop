import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {resolveSui,invoke,assertFrameworkPins,workspace} from './sui-toolchain.mjs';
import {verifyMoveDependencies} from './verify-move-deps.mjs';

function clientOperation(args){
 const client=args.indexOf('client');if(client<0)return -1;
 for(let i=client+1;i<args.length;i++){
  if(['--client.config','--client.env'].includes(args[i])){i++;continue;}
  if(args[i].startsWith('-'))continue;
  return i;
 }
 return -1;
}
export function deploymentCommand(args){
 return ['publish','upgrade'].includes(args[clientOperation(args)]);
}
export function assertDeploymentArgs(args){
 if(args.some(a=>['--build-env','-e','--skip-dependency-verification','--with-unpublished-dependencies'].includes(a)||a.startsWith('--build-env=')))throw Error('Use the active direct Mainnet environment for publish/upgrade. Remove --build-env; do not bypass dependency verification.');
 const path=args[clientOperation(args)+1],canonical=p=>process.platform==='win32'?p.toLowerCase():p;
 if(!path||path.startsWith('-')||canonical(resolve(workspace,path))!==canonical(resolve(workspace,'move/solvency_loop')))throw Error('For project deployment, put move/solvency_loop immediately after publish/upgrade. Only this package receives the dependency preflight.');
}
export function runSui(args){
 const binary=resolveSui();
 if(args[0]==='move')assertFrameworkPins();
 if(deploymentCommand(args)){
  assertDeploymentArgs(args);
  verifyMoveDependencies('stderr');
 }
 invoke(binary,args,{stdio:'inherit'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{runSui(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
