import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import ProductOperations,{type OperationsData} from '../src/components/product-operations';
import {recentPublicationDays} from '../src/lib/publication-history';
import type {api} from '../src/lib/api';
import {emptyProduct} from '../src/lib/product-draft';
import {pricedDraftCaption} from '../src/lib/publication-copy';

test('catalog exposes deletion for failed imported links without preparing or marking a publication',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=tenis'}),old=new Map<string,PropertyDescriptor|undefined>();
 for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const id=crypto.randomUUID(),row={id,kind:'saved' as const,data:{name:'Produto aguardando consulta',store:'Shopee',originalUrl:'https://shopee.com.br/product/123/456'},saved_state:'error',saved_error:'Consulta falhou',catalog_at:new Date().toISOString()},calls:any[]=[];let removed=false;
 const data=():OperationsData=>({rows:removed?[]:[row],total:removed?0:1,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}});
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='DELETE'){assert.equal(path,'/api/shopee/saved-products?brand=tenis');assert.deepEqual(body,{id});removed=true;return {removed:true};}assert.equal(method,'GET');assert.ok(path.startsWith('/api/product-operations?'));return data();}) as typeof api;
 const root=createRoot(document.getElementById('root')!);try{
  await act(async()=>root.render(createElement(ProductOperations,{operation:'tenis',mode:'catalog',initialData:data(),request,onOpen(){throw Error('Pending import must not open a product');},onNavigate(){}})));
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name||name==='Excluir'&&b.getAttribute('aria-label')?.startsWith('Excluir produto:'))!;
  assert.equal(calls.length,0);assert.equal(button('Excluir').closest('details'),null);assert.ok(document.querySelector('a[href*="/ofertas/nova"]'));assert.equal(button('Já publiquei no Telegram'),undefined);
  await act(async()=>button('Excluir').click());assert.equal(calls.length,0);await act(async()=>button('Cancelar').click());assert.equal(calls.length,0);
  await act(async()=>button('Excluir').click());await act(async()=>button('Confirmar exclusão').click());
  assert.equal(document.querySelectorAll('[data-product-id]').length,0);assert.equal(calls.filter(c=>c.method==='DELETE').length,1);assert.ok(calls.every(c=>c.method==='GET'||c.method==='DELETE'));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
test('recent publication days follow Bahia midnight rather than UTC or browser time',()=>{
 assert.deepEqual(recentPublicationDays(Date.parse('2026-11-14T02:59:59Z')),{from:'2026-11-12',to:'2026-11-13'});
 assert.deepEqual(recentPublicationDays(Date.parse('2026-11-14T03:00:00Z')),{from:'2026-11-13',to:'2026-11-14'});
});

test('compact platform actions open confirmation or copy a fresh saved caption without publishing or marking',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=celulares&view=catalog'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const product={...emptyProduct(),operation:'celulares' as const,store:'Shopee' as const,name:'Fone Bluetooth',price:150,inStock:true,checkedAt:new Date().toISOString(),image:'https://down-br.img.susercontent.com/file/fixture',affiliateUrl:'https://s.shopee.com.br/fixture'},caption=pricedDraftCaption(product),copied:string[]=[],opens:string[]=[],calls:string[]=[];let archived=false;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{copied.push(text);}}});
 const initialData:OperationsData={rows:[{id:product.id,data:product}],total:1,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:1,published:0,recent:0,archived:0}};
 const request=(async(path:string,method='GET')=>{calls.push(method+' '+path);assert.equal(method,'GET');assert.equal(path,'/api/products/'+product.id+'/offer');return {product,offer:{id:crypto.randomUUID(),product_id:product.id,snapshot:product,caption,status:'pronto',created_at:product.createdAt,updated_at:product.createdAt},archived};}) as typeof api;
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(createElement(ProductOperations,{operation:'celulares',mode:'catalog',initialData,request,onOpen(_id,intent){opens.push(intent);},onNavigate(){}})));
  const button=(label:string)=>document.querySelector<HTMLButtonElement>('button[aria-label="'+label+'"]')!;
  await act(async()=>button('Postar no Telegram').click());await act(async()=>button('Agendar publicação').click());assert.deepEqual(opens,['telegram','schedule']);assert.equal(calls.length,0);
  await act(async()=>button('Copiar para WhatsApp').click());assert.deepEqual(copied,[caption]);assert.equal(calls.length,1);
  archived=true;await act(async()=>button('Copiar para WhatsApp').click());assert.equal(copied.length,1);assert.match(document.querySelector('[role=alert]')!.textContent!,/arquivado/);
  assert.ok(calls.every(call=>call.startsWith('GET ')));assert.equal(document.querySelector('.compact-platform-status .status-pronto'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of prior){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
test('curation exposes ineligible cached products, paginates all pending and updates rows/counts after decisions without external searches',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const rows=Array.from({length:45},(_,i)=>({id:crypto.randomUUID(),kind:'cache' as const,data:{name:'Controle gamer '+i,price:149.9,image:'',offerLink:'https://s.shopee.com.br/fixture'},eligible:false,reasons:['Fora dos critérios automáticos']}));let total=45;const calls:{path:string;method:string}[]=[];
 const response=(page=0):OperationsData=>({rows:rows.slice(page*24,page*24+24),total,page,more:total>(page+1)*24,recent:[],recentTotal:0,channels:{},summary:{pending:total,approved:0,published:0,recent:0,archived:0}});
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method});assert.ok(path.startsWith('/api/product-operations'));if(method==='POST'){assert.equal(body.action,'decide');assert.equal(body.decision,'rejected');rows.splice(rows.findIndex(r=>r.id===body.id),1);total--;return {};}return response(Number(new URL(path,'https://dropou.test').searchParams.get('page')||0));}) as typeof api;
 const root=createRoot(document.getElementById('root')!);try{
  await act(async()=>root.render(createElement(ProductOperations,{mode:'curation',request,onOpen(){},onNavigate(){}})));
  assert.equal(document.querySelectorAll('[data-product-id]').length,24);assert.match(document.body.textContent!,/45 produto/);
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
  assert.equal(button('Aprovar').disabled,false);await act(async()=>button('Próxima').click());assert.equal(document.querySelectorAll('[data-product-id]').length,21);
  await act(async()=>button('Rejeitar').click());assert.match(document.body.textContent!,/44 produto/);assert.equal(document.querySelectorAll('[data-product-id]').length,20);assert.ok(calls.every(c=>!c.path.includes('search')&&!c.path.includes('shopee/automation')));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
test('dashboard marks and undoes exactly one channel and moves published products out of the primary queue',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const id=crypto.randomUUID(),row={id,data:{name:'Controle de teste',price:150,image:'',store:'Shopee'}},markId=crypto.randomUUID(),stamp=new Date().toISOString(),empty={published:false,publishedAt:null,state:null,scheduledAt:null};let marked=false;const mutations:any[]=[];
 const data=():OperationsData=>({rows:marked?[]:[row],total:marked?0:1,more:false,page:0,recent:marked?[row]:[],recentTotal:marked?1:0,channels:{[id]:{telegram:marked?{...empty,published:true,publishedAt:stamp,manualMarkId:markId}:empty,whatsapp:empty}},summary:{pending:0,approved:marked?0:1,published:marked?1:0,recent:marked?1:0,archived:0}});
 const request=(async(path:string,method='GET',body?:any)=>{assert.ok(path.startsWith('/api/product-operations'));if(method==='POST'){assert.equal(body.action,'mark');assert.equal(body.channel,'telegram');assert.equal(body.id,id);mutations.push(body);marked=!body.undo;return {};}return data();}) as typeof api;
 const root=createRoot(document.getElementById('root')!);try{
  await act(async()=>root.render(createElement(ProductOperations,{request,onOpen(){},onNavigate(){}})));
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
  await act(async()=>button('Já publiquei no Telegram').click());assert.equal(button('Já publiquei no Telegram').disabled,true);assert.equal(button('Já publiquei no WhatsApp').disabled,false);assert.equal(document.querySelectorAll('[data-product-id]').length,1);assert.equal(document.querySelector('.operation-recent [data-product-id]')?.getAttribute('data-product-id'),id);
  await act(async()=>button('Desfazer marcação').click());assert.equal(button('Já publiquei no Telegram').disabled,false);assert.equal(mutations[1].undo,markId);assert.equal(document.querySelector('.operation-recent [data-product-id]'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}
});
