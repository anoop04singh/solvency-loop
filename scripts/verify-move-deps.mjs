import {pathToFileURL} from 'node:url';
import {resolveSui,assertFrameworkPins,invoke} from './sui-toolchain.mjs';

export function verifyMoveDependencies(output='stdout'){
 assertFrameworkPins();const binary=resolveSui('verifier');
 const chain=invoke(binary,['client','chain-identifier'],{encoding:'utf8'}).stdout.trim();
 if(chain!=='35834a8a')throw Error('Select the direct Sui Mainnet CLI environment before verifying dependencies.');
 const result=invoke(binary,['client','verify-source','move/solvency_loop','--build-env','mainnet','--verify-deps','--skip-source'],{encoding:'utf8'});
 process[output].write(result.stdout||'');process.stderr.write(result.stderr||'');
 process[output].write('[PASS] Mainnet framework and MemWal dependency source verification. No signing or execution.\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{verifyMoveDependencies();}catch(e){console.error(e.message);process.exitCode=1;}
