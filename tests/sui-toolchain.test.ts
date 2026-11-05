import test from 'node:test';
import assert from 'node:assert/strict';
import {assertVersion,assertFrameworkPins,toolchains} from '../scripts/sui-toolchain.mjs';
import {deploymentCommand,assertDeploymentArgs} from '../scripts/sui.mjs';

test('Move commands reject the old VM and require the isolated legacy source verifier',()=>{
 assertVersion('sui 1.82.3-bf4073918ed3');
 assertVersion('sui 1.72.2-85b460a63fd7-dirty','verifier');
 assert.throws(()=>assertVersion('sui 1.72.2-85b460a63fd7'),/1.82.3/);
 assert.throws(()=>assertVersion('sui 1.82.3-bf4073918ed3','verifier'),/1.72.2/);
 assert.throws(()=>assertVersion('sui 1.82.3-000000000000'),/pinned release/);
 assert.throws(()=>assertVersion('unrecognized binary'),/pinned release/);
 assertFrameworkPins();
 for(const role of Object.values(toolchains))for(const hash of Object.values(role.hashes))assert.match(hash,/^[a-f0-9]{64}$/);
});

test('publish and upgrade preflight selection survives global CLI options',()=>{
 assert.equal(deploymentCommand(['client','publish','move/solvency_loop','--dry-run']),true);
 assert.equal(deploymentCommand(['client','--client.env','solvency-direct-mainnet','upgrade']),true);
 assert.equal(deploymentCommand(['--json','client','publish','move/solvency_loop']),true);
 assert.equal(deploymentCommand(['client','verify-source','move/solvency_loop']),false);
 assert.equal(deploymentCommand(['client','call','--function','upgrade']),false);
 assert.equal(deploymentCommand(['move','test','--path','move/solvency_loop']),false);
 assertDeploymentArgs(['client','publish','move/solvency_loop','--dry-run','--verify-deps']);
 for(const flag of ['--build-env=mainnet','--skip-dependency-verification','--with-unpublished-dependencies'])assert.throws(()=>assertDeploymentArgs(['client','publish','move/solvency_loop',flag]),/do not bypass/);
 assert.throws(()=>assertDeploymentArgs(['client','publish','another-package']),/Only this package/);
});
