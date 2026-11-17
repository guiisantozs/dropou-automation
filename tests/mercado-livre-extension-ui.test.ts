import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {spawnSync} from 'node:child_process';
import {ExtensionProductReview} from '../src/components/mercado-livre-extension';
import {inboxFixture} from './fixtures/ml-extension';
import type {api} from '../src/lib/api';
test('compact extension review asks only for missing facts and does not contain another publication form',()=>{
 const row=inboxFixture(),request=(async()=>{throw Error('no writes in SSR');}) as typeof api;
 const full=renderToStaticMarkup(createElement(ExtensionProductReview,{row,request,onPrepared(){}}));assert.ok(!full.includes('type="url"'));assert.ok(!full.includes('type="number"'));assert.match(full,/não comprovam atribuição/);assert.ok(!full.includes('Publicar agora'));assert.ok(!full.includes('Etapa'));
 const missing=renderToStaticMarkup(createElement(ExtensionProductReview,{row:{...row,draft:{...row.draft,name:'',price:0,image:''}},request,onPrepared(){}}));assert.match(missing,/Nome no anúncio/);assert.match(missing,/Preço atual/);assert.match(missing,/foto real/);assert.ok(!missing.includes('avaliação'));
});
test('review is explicit, does not publish, prepares once and never opens a stale operation after unmount',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou-automation.vercel.app'}),old=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const root=createRoot(document.getElementById('root')!),row=inboxFixture(),writes:unknown[]=[],opened:unknown[]=[];let resolveResult:(v:unknown)=>void=()=>{};
 const request=(async(path:string,method:string,body:unknown)=>{assert.equal(path,'/api/mercado-livre/extension');assert.equal(method,'POST');writes.push(body);return new Promise<unknown>(resolve=>{resolveResult=resolve;});}) as typeof api;
 try{
  await act(async()=>root.render(createElement(ExtensionProductReview,{row,request,onPrepared:p=>opened.push(p)})));
  assert.equal(document.querySelector<HTMLButtonElement>('button')!.disabled,true);assert.equal(writes.length,0);
  await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].click());assert.equal(document.querySelector<HTMLButtonElement>('button')!.disabled,false);
  await act(async()=>{document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(writes.length,1);assert.equal(opened.length,0);
  await act(async()=>root.unmount());await act(async()=>resolveResult({product:row.draft,existing:false}));assert.equal(opened.length,0);
 }finally{dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
test('actual HTTP handlers reject unauthorized access and origins; receive uses the existing importer and explicit review only',()=>{
 const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/fixtures/ml-extension-http.ts'],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/HTTP checks passed/);
});
