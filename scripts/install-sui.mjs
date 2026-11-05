import {mkdir,access,rename,chmod} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dirname,join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {toolchains,localBinary,resolveSui,assertVersion} from './sui-toolchain.mjs';

async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
for(const role of ['mainnet','verifier']){
 const c=toolchains[role];try{console.log('[PASS] '+role+': '+resolveSui(role));continue;}catch{/* Install the explicitly pinned official artifact. */}
 const platform=process.platform+'-'+process.arch,digest=c.hashes[platform];if(!digest)throw Error('Unsupported Sui binary platform: '+platform);
 const os={win32:'windows',darwin:'macos',linux:'ubuntu'}[process.platform],arch=process.arch==='x64'?'x86_64':process.platform==='linux'?'aarch64':'arm64';
 const name='sui-mainnet-v'+c.version+'-'+os+'-'+arch+'.tgz',binary=localBinary(role),dir=dirname(binary),archive=join(dir,name);
 await mkdir(dir,{recursive:true});
 let cached=false;try{await access(archive);cached=await hash(archive)===digest;}catch{/* Download absent or interrupted archives. */}
 if(!cached){
  const url='https://github.com/MystenLabs/sui/releases/download/mainnet-v'+c.version+'/'+name;console.log('Downloading official '+name);
  const r=await fetch(url);if(!r.ok||!r.body)throw Error('Official Sui download failed: HTTP '+r.status);
  const partial=archive+'.part';await pipeline(Readable.fromWeb(r.body),createWriteStream(partial));
  if(await hash(partial)!==digest)throw Error('Sui archive checksum mismatch. No binary was installed.');
  await rename(partial,archive);
 }
 if(await hash(archive)!==digest)throw Error('Sui archive checksum mismatch.');
 const list=spawnSync('tar',['-tzf',archive],{encoding:'utf8',windowsHide:true});if(list.status!==0)throw Error('Cannot inspect Sui archive. Install tar first.');
 const entry=list.stdout.trim().split(/\r?\n/).find(p=>p==='./'+basename(binary)||p===basename(binary));if(!entry)throw Error('Expected root Sui binary is missing from the official archive.');
 const extracted=spawnSync('tar',['-xzf',archive,'-C',dir,entry],{windowsHide:true,stdio:'inherit'});if(extracted.status!==0)throw Error('Sui extraction failed.');
 // Keep only the expected binary as the executable entry point; no installer,
 // global PATH edit, wallet setup, signing or network transaction is performed.
 if(process.platform!=='win32')await chmod(binary,0o755);
 const version=spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true});assertVersion(version.stdout,role);
 console.log('[PASS] '+role+' installed; archive SHA256 '+digest);
}
