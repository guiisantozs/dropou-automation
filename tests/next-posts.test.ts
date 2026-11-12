import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import NextPosts from '../src/components/next-posts';
import PublicationActions from '../src/components/publication-actions';
import {scheduleGroup} from '../src/lib/schedule-groups';
import {shopeeProduct} from '../src/lib/shopee-product';
import {safePublicationCaption} from '../src/lib/publication-copy';
import type {ShopeeOffer} from '../src/lib/shopee-automation';
import type {api} from '../src/lib/api';
import type {Offer} from '../src/lib/offers';
function domFixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}};}
const source:ShopeeOffer={itemId:'9001',shopId:'8001',name:'Controle PC Xbox Bluetooth',price:180,priceMax:180,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/8001/9001',rating:4.8,sales:1000,commission:.1,reportedDiscount:70,checkedAt:new Date().toISOString()};

test('next posts keeps approved Tech visible after reload and prepares schedule/instant preview without sending',async()=>{
 const {container,close}=domFixture(),root=createRoot(container),p=shopeeProduct(source),removed=shopeeProduct({...source,name:'Headset removido'}),opened:unknown[]=[],calls:string[]=[];
 const makeOffer=(product:typeof p)=>({id:crypto.randomUUID(),product_id:product.id,caption:safePublicationCaption(product),snapshot:product,status:'rascunho',created_at:product.createdAt,updated_at:product.createdAt}) as Offer;
 const data={offers:[{id:crypto.randomUUID(),data:source,score:80,eligible:true,reasons:[],decision:'approved',prepared_product_id:p.id},{id:crypto.randomUUID(),data:{...source,name:removed.name},score:80,eligible:true,reasons:[],decision:'removed',prepared_product_id:removed.id}]};
 const request=(async(path:string,method='GET',body?:any)=>{calls.push(method+' '+path);assert.ok(!/\/ai\/|\/telegram|\/schedule/.test(path));if(method==='POST'){assert.equal(body.action,'prepare');return {productId:p.id};}return data;}) as typeof api;
 const props={operation:'dropou' as const,products:[p,removed],offers:[makeOffer(p),makeOffer(removed)],request,onOpen:(...args:unknown[])=>opened.push(args)};
 try{await act(async()=>root.render(createElement(NextPosts,props)));assert.equal(container.querySelectorAll('.next-post-card').length,1);assert.ok(!container.textContent!.includes('Headset removido'));
  const click=async(label:string)=>act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!.click());
  await click('Agendar');assert.deepEqual(opened[0],[p.id,'schedule','dropou']);await click('Publicar agora');assert.deepEqual(opened[1],[p.id,'telegram','dropou']);
  await act(async()=>root.render(createElement(NextPosts,{...props,key:'reload'})));assert.equal(container.querySelectorAll('.next-post-card').length,1);assert.equal(calls.filter(c=>c.startsWith('POST')).length,2);
 }finally{await act(async()=>root.unmount());close();}
});

test('deep-linked publish/schedule opens the existing confirmation without any mutation request',async()=>{
 for(const initialAction of ['schedule','telegram'] as const){const {container,close}=domFixture(),root=createRoot(container),p=shopeeProduct(source),text=safePublicationCaption(p),o={id:crypto.randomUUID(),product_id:p.id,snapshot:p,caption:text,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt} as Offer,calls:string[]=[];
  const request=(async(path:string,method='GET')=>{calls.push(path);assert.equal(method,'GET');assert.equal(path,'/api/publication-config');return {enabled:false,telegram:{available:true,id:'-100123',key:'fixture',title:'Canal correto'}};}) as typeof api;
  try{await act(async()=>root.render(createElement(PublicationActions,{product:p,offer:o,text,initialAction,request,save:async()=>{throw Error('No automatic save');},onUpdate:async()=>{},onEdit(){}})));assert.equal(calls.length,1);assert.ok(container.querySelector('[role=dialog]'));assert.match(container.querySelector('[role=dialog]')!.textContent!,initialAction==='schedule'?/Confirmar agendamento/:/Confirmar envio ao Telegram/);assert.match(container.textContent!,/Canal correto/);assert.equal(p.inStock,null);
  }finally{await act(async()=>root.unmount());close();}
 }
});

test('schedule groups use Bahia day boundaries and retain overdue, uncertain and completed states',()=>{
 const now=Date.parse('2026-11-12T23:00:00Z'),job=(scheduled_at:string,state='queued')=>({scheduled_at,state});
 assert.equal(scheduleGroup(job('2026-11-13T01:00:00Z'),now),'today');assert.equal(scheduleGroup(job('2026-11-13T04:00:00Z'),now),'upcoming');assert.equal(scheduleGroup(job('2026-11-12T22:59:00Z'),now),'pending');assert.equal(scheduleGroup(job('invalid'),now),'pending');assert.equal(scheduleGroup(job('2026-11-13T04:00:00Z','uncertain'),now),'pending');assert.equal(scheduleGroup(job('invalid','sent'),now),'history');assert.equal(scheduleGroup(job('invalid','cancelled'),now),'history');
});

test('an unverified saved destination explains the problem and can recheck permission without sending',async()=>{
 const {container,close}=domFixture(),root=createRoot(container),p=shopeeProduct(source),text=safePublicationCaption(p),offer={id:crypto.randomUUID(),product_id:p.id,snapshot:p,caption:text,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt} as Offer,calls:string[]=[];let verified=false;
 const request=(async(path:string,method='GET',body?:any)=>{calls.push(method+' '+path);if(method==='POST'){assert.equal(path,'/api/operations?brand=dropou');assert.deepEqual(body,{brand:'dropou'});verified=true;return {telegram:{title:'Canal salvo'}};}assert.equal(path,'/api/publication-config');return {enabled:false,telegram:{available:verified,title:'Canal salvo',id:'-100123',reason:verified?undefined:'A permissão do bot ainda precisa ser verificada.',key:verified?'fixture':undefined}};}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationActions,{product:p,offer,text,initialAction:'schedule',request,save:async()=>offer,onUpdate:async()=>{},onEdit(){}})));assert.match(container.querySelector('[role=dialog]')!.textContent!,/Canal salvo/);assert.match(container.querySelector('.destination-verification')!.textContent!,/permissão do bot/);
  await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Verificar canal e permissão do bot')!.click());assert.equal(container.querySelector('.destination-verification'),null);assert.equal(calls.filter(c=>c.startsWith('POST')).length,1);assert.ok(calls.every(c=>!c.includes('/telegram')&&!c.includes('/schedule')));
 }finally{await act(async()=>root.unmount());close();}
});
