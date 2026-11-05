import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {resolveSui,assertFrameworkPins} from './sui-toolchain.mjs';
assertFrameworkPins();
const publication = readFileSync('move/vendor/memwal/Published.toml', 'utf8');
const published = publication.match(/^published-at\s*=\s*"(0x[0-9a-f]{64})"/m)?.[1];
assert.ok(published, 'MemWal Mainnet publication binding is missing.');
const result = spawnSync(resolveSui(), ['move', 'build', '--path', 'move/solvency_loop', '--build-env', 'mainnet', '--dump-bytecode-as-base64', '--no-tree-shaking'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,windowsHide:true });
if (result.error) throw result.error;
if (result.status !== 0) { console.error((result.stderr || result.stdout).slice(0, 8000)); process.exit(result.status || 1); }
const json = result.stdout.slice(result.stdout.indexOf('{'));
const bundle = JSON.parse(json);
assert.equal(bundle.modules.length, 2, 'Only SolvencyLoop core and autopilot should be published; dependency/test modules must not be included.');
assert.ok(bundle.dependencies.includes(published), 'Publish bundle does not link to the existing Mainnet MemWal package.');
assert.ok(bundle.dependencies.every(id => /^(0x)?[0-9a-fA-F]{1,64}$/.test(id)), 'Invalid dependency ID.');
console.log('[PASS] Offline publish/upgrade bundle: two application modules, existing Mainnet MemWal dependency ' + published + '. No RPC calls or transactions.');
