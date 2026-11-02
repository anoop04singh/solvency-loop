import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMemory} from '../src/lib/memory-api';
test('signed learning responses cannot silently become empty history, and Smart Fill uses its authenticated endpoint',async()=>{
 const fetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),wallet='0x'+'1'.repeat(64);let response:unknown={},path='',message='';
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:3000'}}});
 globalThis.fetch=async(input)=>{path=String(input);return Response.json(response);};
 const sign=async({message:bytes}:{message:Uint8Array})=>{message=new TextDecoder().decode(bytes);return {signature:'test-only'};};
 try{
  await assert.rejects(requestMemory({action:'refresh_learning',walletAddress:wallet},sign),/incomplete/);
  response={memories:[],verifiedSettlements:[],rejectedEvidenceCount:0,tatumAnchor:{checkpoint:'123'}};assert.deepEqual((await requestMemory({action:'refresh_learning',walletAddress:wallet},sign)).memories,[]);
  await assert.rejects(requestMemory({action:'smart_split',walletAddress:wallet,text:'My exact receipt'},sign),/validated bill draft/);assert.equal(path,'/api/smart-split');assert.match(message,/My exact receipt/);assert.match(message,/smart_split/);
  await assert.rejects(requestMemory({action:'settlement',walletAddress:wallet,digest:'3'.repeat(44)},sign),/without paying again/);
 }finally{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
