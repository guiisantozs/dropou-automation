import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import CaptionCorrection from '../src/components/caption-correction';import {emptyProduct} from '../src/lib/product-draft';import {formatCaption} from '../src/lib/ai';import {savedPublicationState} from '../src/lib/saved-publication';
const p={...emptyProduct(),operation:'celulares' as const,name:'Carregador do contrato',price:29.51,affiliateUrl:'https://meli.la/fixture',inStock:true,checkedAt:new Date().toISOString()};
test('the real saved-library handler uses authenticated owner/brand context for the canonical summary',()=>{
 const r=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/fixtures/schedule-library-context.ts'],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/authenticated library summary passed/);
});
test('repair comparison requires a user click and changes only the preview, never saves or sends',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const root=createRoot(document.getElementById('root')!),before=formatCaption(p,'celulares')+'\nEconomize!',accepted:string[]=[];
 try{await act(async()=>root.render(createElement(CaptionCorrection,{text:before,product:p,onAccept:v=>accepted.push(v)})));assert.equal(accepted.length,0);assert.ok(!document.querySelector('pre'));await act(async()=>document.querySelector('button')!.click());assert.equal(document.querySelectorAll('pre').length,2);assert.equal(document.querySelectorAll('pre')[0].textContent,before);assert.equal(accepted.length,0);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Usar esta versão na prévia')!.click());assert.equal(accepted.length,1);assert.ok(!accepted[0].includes('Economize'));}
 finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
test('publication requires real receipt IDs; failed, uncertain and partial states never become posted',()=>{
 for(const state of ['failed','uncertain','partial','sent']){assert.equal(savedPublicationState({product:p,delivery:{state,message_ids:[],destination_title:'Fixture'}}).posted,false);}
 assert.equal(savedPublicationState({product:p,delivery:{state:'sent',message_ids:['42'],destination_title:'Fixture',sent_at:new Date().toISOString()}}).posted,true);
});
