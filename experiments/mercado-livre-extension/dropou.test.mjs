import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {officialDropou,dropouPayload} from './dropou.mjs';
const origin='https://dropou-automation.vercel.app';
test('only the exact official origin and meli.la candidates enter the protocol',()=>{
 assert.equal(officialDropou(origin+'/?brand=dropou'),true);for(const bad of ['http://dropou-automation.vercel.app','https://dropou-automation.vercel.app.evil.test','https://user:secret@dropou-automation.vercel.app','http://localhost:3000'])assert.equal(officialDropou(bad),false);
 const item={state:'candidate',source:'https://produto.mercadolivre.com.br/MLB-1234567890-headset-_JM',candidate:'https://meli.la/fixture'};assert.equal(dropouPayload(item,crypto.randomUUID()).itemId,'MLB1234567890');
 for(const candidate of ['https://meli.la.evil.test/fixture','https://meli.la/fixture?token=x','https://mercadolivre.com.br/MLB12345'])assert.throws(()=>dropouPayload({...item,candidate},crypto.randomUUID()));assert.throws(()=>dropouPayload({...item,state:'working'},crypto.randomUUID()));
});
test('isolated content bridge rejects other senders, frames, origins and correlation IDs; forwards only allowlisted receipt data',()=>{
 let listener,timeout;const events=new Map(),posted=[],replies=[];
 const window={addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type),postMessage:(data,target)=>posted.push({data,target})};window.top=window;
 const chrome={runtime:{id:'fixture-extension',onMessage:{addListener(fn){listener=fn;}}}};
 runInNewContext(readFileSync(new URL('./dropou-bridge.js',import.meta.url),'utf8'),{window,location:{origin},chrome,crypto,Date,Number,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){}});
 const message={protocol:'dropou-ml-v1',command:'connect'};
 listener(message,{id:'another-extension'},v=>replies.push(v));assert.equal(posted.length,0);
 assert.equal(listener(message,{id:chrome.runtime.id},v=>replies.push(v)),true);assert.equal(posted[0].target,origin);
 const sent=posted[0].data,valid={source:window,origin,data:{protocol:'dropou-ml-v1',direction:'to-extension',id:sent.id,result:{ok:true,operation:'dropou',connectionId:crypto.randomUUID(),expiresAt:Date.now()+300000,access_token:'MUST_NOT_CROSS'}}};
 events.get('message')({...valid,origin:'https://evil.test'});events.get('message')({...valid,source:{}});events.get('message')({...valid,data:{...valid.data,id:crypto.randomUUID()}});assert.equal(replies.length,0);
 events.get('message')(valid);assert.equal(replies.length,1);assert.equal(replies[0].access_token,undefined);assert.equal(Object.keys(replies[0]).sort().join(','),'connectionId,expiresAt,ok,operation');
 listener({...message,command:'receive',payload:{requestId:crypto.randomUUID()}},{id:chrome.runtime.id},v=>replies.push(v));timeout();assert.equal(replies.at(-1).ok,false);assert.match(replies.at(-1).error,/Sem confirmação/);
});
