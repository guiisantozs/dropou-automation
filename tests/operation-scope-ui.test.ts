import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {emptyProduct} from '../src/lib/product-draft';
import OfferPreview from '../src/components/offer-preview';
import AIUsage from '../src/components/ai-usage';
import {createRoot} from 'react-dom/client';
import {operationPath,bindOperationRequest} from '../src/lib/operation-navigation';
import {selectOperation,selectedOperation} from '../src/lib/workspace-brands';
import type {api} from '../src/lib/api';
import ShopeeTools from '../src/components/shopee-tools';
import PublicationsWorkspace from '../src/components/publications-workspace';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=celulares&view=search'}),prior=new Map<string,PropertyDescriptor|undefined>();for(const [k,v] of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}return {root:createRoot(document.getElementById('root')!),close(){dom.window.close();for(const [k,v]of prior){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}};}
const data=(used:number)=>({admin:true,credentialsReady:true,budget:{manualUsed:used,manualLimit:200,discoveryUsed:0,discoveryLimit:8,imports:used,cacheHits:0,limitErrors:0},requests:[]});
test('bound operation requests preserve query parameters and explicit destination choices',()=>{
 assert.equal(operationPath('/api/workspace?page=2','celulares'),'/api/workspace?page=2&brand=celulares');
 assert.equal(operationPath('/api/publication-records?brand=tenis&page=1','celulares'),'/api/publication-records?brand=tenis&page=1');
 assert.equal(operationPath('/?view=curation#products','celulares'),'/?view=curation&brand=celulares#products');
});
test('switching operations updates URL and theme while an older async chain remains bound to its original operation',async()=>{
 const {root,close}=fixture(),calls:string[]=[];
 try{selectOperation('celulares');const request=bindOperationRequest((async(path:string)=>{calls.push(path);await Promise.resolve();return {};}) as typeof api,'celulares');
  const inFlight=request('/api/shopee/saved-products','POST',{links:[]});selectOperation('dropou');await inFlight;await request('/api/shopee/saved-products?page=1');
  assert.ok(calls.every(p=>new URL(p,'https://dropou.test').searchParams.get('brand')==='celulares'));assert.equal(selectedOperation(),'dropou');assert.equal(document.documentElement.dataset.operation,'dropou');
  selectOperation('celulares');assert.equal(document.documentElement.dataset.operation,'celulares');assert.equal(new URL(window.location.href).searchParams.get('view'),'search');assert.equal(window.sessionStorage.getItem('dropou.operation'),'celulares');
 }finally{await act(async()=>root.unmount());close();}
});
test('a late search response from the previous operation never fills the newly selected operation',async()=>{
 const {root,close}=fixture();let oldResolve!:(value:unknown)=>void;
 const old=bindOperationRequest((async()=>await new Promise<unknown>(resolve=>{oldResolve=resolve;})) as typeof api,'dropou'),current=bindOperationRequest((async(path:string)=>{assert.ok(path.includes('brand=celulares'));return data(17);}) as typeof api,'celulares');
 try{await act(async()=>root.render(createElement(ShopeeTools,{key:'dropou',operation:'dropou',request:old,onCurated(){}})));
  await act(async()=>root.render(createElement(ShopeeTools,{key:'celulares',operation:'celulares',request:current,onCurated(){}})));assert.match(document.body.textContent!,/17 \/ 200/);
  await act(async()=>oldResolve(data(99)));assert.match(document.body.textContent!,/17 \/ 200/);assert.doesNotMatch(document.body.textContent!,/99 \/ 200/);
 }finally{await act(async()=>root.unmount());close();}
});
test('publication history in Celulares cannot change operation through its channel filter',async()=>{
 const {root,close}=fixture();const initialData={entries:[],more:false,total:0,serverNow:new Date().toISOString(),allowedBrands:['dropou','celulares','tenis'],admin:true,operators:[]};
 try{await act(async()=>root.render(createElement(PublicationsWorkspace,{operation:'celulares',initialData})));
  const options=[...document.querySelectorAll<HTMLOptionElement>('select[aria-label="Canal das publicações"] option')].map(o=>o.value);assert.deepEqual(options,['celulares']);
 }finally{await act(async()=>root.unmount());close();}
});

test('the Celulares offer preview identifies its own operation instead of Tech and Games',()=>{
 const product={...emptyProduct(),operation:'celulares' as const,name:'Celular de teste'};
 const html=renderToStaticMarkup(createElement(OfferPreview,{product,page:true,onRefresh:async()=>{},onClose(){},onEdit(){}}));
 assert.match(html,/PUBLICAÇÃO · DROPOU \| CELULARES &amp; GADGETS/);assert.doesNotMatch(html,/TECH &amp; GAMES/);
});
test('caption tools keep only the selected operation products and language without loading the global budget',async()=>{
 const {root,close}=fixture(),cell={...emptyProduct(),operation:'celulares' as const,name:'Fone do canal de celulares'},tech={...emptyProduct(),operation:'dropou' as const,name:'Teclado de outra operação'};
 try{await act(async()=>root.render(createElement(AIUsage,{operation:'celulares',products:[cell,tech],onRefresh:async()=>{}})));
  assert.match(document.body.textContent!,/Fone do canal de celulares/);assert.doesNotMatch(document.body.textContent!,/Teclado de outra operação|Consumo global de IA|Configure o Supabase/);
  assert.deepEqual([...document.querySelectorAll('select')[0].options].map(o=>o.value),['celulares']);
 }finally{await act(async()=>root.unmount());close();}
});
