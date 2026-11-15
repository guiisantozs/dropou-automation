import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import PublicationSchedule from '../src/components/publication-schedule';
import PublicationsWorkspace from '../src/components/publications-workspace';
import {emptyProduct} from '../src/lib/product-draft';
import type {api} from '../src/lib/api';
import type {SchedulePage,ScheduledDestination,RecordsPage,PublishedRecord} from '../src/lib/publication-workspace';
import {publicationChangeEvent} from '../src/lib/publication-sync';
const now=new Date().toISOString(),product={...emptyProduct(),name:'Controle gamer de teste',price:149.9,image:''};
const tg:ScheduledDestination={id:crypto.randomUUID(),product_id:product.id,offer_id:crypto.randomUUID(),brand_id:'dropou',channel:'telegram',state:'queued',scheduled_at:new Date(Date.now()+3600000).toISOString(),destination_title:'Canal gamer de teste',attempts:0,message_ids:[],name:product.name,data:product};
const wa:ScheduledDestination={...tg,id:crypto.randomUUID(),channel:'whatsapp',destination_title:'WhatsApp gamer',state:'ready',scheduled_at:new Date(Date.now()-60000).toISOString()};
const schedule=(jobs:ScheduledDestination[]):SchedulePage=>({jobs,channels:{},total:jobs.length?1:0,more:false,serverNow:now,summary:{today:jobs.length,pending:jobs.length,attention:jobs.filter(j=>j.state==='ready').length,next:jobs.find(j=>j.state==='queued')?.scheduled_at||null}});
const base:PublishedRecord={id:crypto.randomUUID(),product_id:product.id,brand_id:'dropou',product_name:product.name,channel:'telegram',status:'sent',occurred_at:now,recorded_at:now,scheduled_at:now,destination:'Canal gamer',destination_id:'-1004567',message_ids:['12'],confirmed_by:null,is_republication:false,publication_round:crypto.randomUUID(),error:null,review_required:false,source:'telegram_receipt',snapshot:product,actor_id:null,actor_name:undefined};
const manual:PublishedRecord={...base,id:crypto.randomUUID(),channel:'whatsapp',status:'manual_confirmed',message_ids:[],source:'manual_mark',actor_id:crypto.randomUUID(),actor_name:'Operador · 0002',destination:'WhatsApp gamer'};
const records=(entries:PublishedRecord[]):RecordsPage=>({entries,total:entries.length,more:false,serverNow:now,allowedBrands:['dropou'],admin:false,operators:[]});
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}};}
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
test('compact schedule groups both destinations, confirms manual WhatsApp once and preserves Telegram',async()=>{
 const {container,close}=fixture(),root=createRoot(container),calls:any[]=[];let jobs=[tg,wa];
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='POST'){assert.equal(path,'/api/publication-records?brand=dropou');assert.equal(body.action,'mark');assert.equal(body.cancelScheduled,true);assert.equal(body.confirmed,true);jobs=[tg];return {};}assert.equal(method,'GET');return {...schedule(jobs),channels:{[product.id]:{telegram:{published:false,publishedAt:null,state:'queued',scheduledAt:tg.scheduled_at},whatsapp:{published:true,publishedAt:now,state:'sent',scheduledAt:null}}}};}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationSchedule,{request,initialData:schedule(jobs)})));assert.equal(container.querySelectorAll('.pw-card').length,1);assert.equal(calls.length,0);assert.match(container.textContent!,/Pendente manual/);
  await act(async()=>button('Marcar como enviado').click());assert.equal(calls.length,0);await act(async()=>button('Confirmar publicação manual').click());assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(container.querySelectorAll('.pw-destination').length,1);assert.match(container.textContent!,/Telegram/);assert.match(container.textContent!,/WhatsApp: Publicado/);assert.ok(calls.every(c=>!c.path.includes('/telegram')));
 }finally{await act(async()=>root.unmount());close();}
});
test('schedule cancellation needs confirmation and never sends or requeues a message',async()=>{
 const {container,close}=fixture(),root=createRoot(container),calls:any[]=[];let jobs=[tg];
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='DELETE'){assert.deepEqual(body,{id:tg.id,confirmed:true});jobs=[];return {};}assert.equal(method,'GET');return schedule(jobs);}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationSchedule,{request,initialData:schedule(jobs)})));await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Cancelar agendamento Telegram"]')!.click());assert.equal(calls.length,0);await act(async()=>button('Voltar').click());assert.equal(calls.length,0);await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Cancelar agendamento Telegram"]')!.click());await act(async()=>button('Confirmar cancelamento').click());assert.match(container.textContent!,/Nenhuma publicação agendada/);assert.equal(calls.filter(c=>c.method==='DELETE').length,1);
 }finally{await act(async()=>root.unmount());close();}
});
test('database invalidation refreshes a visible schedule and removes completed destinations',async()=>{
 const {container,dom,close}=fixture(),root=createRoot(container);let reads=0;const request=(async()=>{reads++;return schedule([]);}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationSchedule,{request,initialData:schedule([tg])})));assert.equal(reads,0);await act(async()=>{window.dispatchEvent(new dom.window.Event(publicationChangeEvent));await new Promise(r=>setTimeout(r,220));});assert.equal(reads,1);assert.equal(container.querySelectorAll('.pw-card').length,0);
 }finally{await act(async()=>root.unmount());close();}
});
test('publications starts with today, groups real records and filters old dates without sending',async()=>{
 const {container,close}=fixture(),root=createRoot(container),calls:any[]=[];
 const request=(async(path:string,method='GET')=>{calls.push({path,method});assert.equal(method,'GET');return records([base,manual]);}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationsWorkspace,{request})));assert.ok(calls[0].path.includes('period=today'));assert.equal(container.querySelectorAll('.pw-card').length,1);assert.match(container.textContent!,/Confirmado pela API/);assert.match(container.textContent!,/Publicado manualmente/);assert.equal(container.querySelector('select[value="all"]'),null);await act(async()=>button('Ontem').click());assert.ok(calls.at(-1).path.includes('period=yesterday'));await act(async()=>button('Últimos 7 dias').click());assert.ok(calls.at(-1).path.includes('period=week'));assert.ok(calls.every(c=>!c.path.includes('/telegram')));
 }finally{await act(async()=>root.unmount());close();}
});
test('manual correction is confirmed, audited by the server and leaves the Telegram record visible',async()=>{
 const {container,close}=fixture(),root=createRoot(container),calls:any[]=[];let entries=[base,manual];
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='POST'){assert.deepEqual(body,{action:'undo',id:manual.id,source:'manual_mark',confirmed:true});entries=[base];return {};}return records(entries);}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationsWorkspace,{request,initialData:records(entries)})));await act(async()=>button('Corrigir marcação').click());assert.equal(calls.length,0);await act(async()=>button('Confirmar correção').click());assert.equal(container.querySelectorAll('.pw-published-event').length,1);assert.match(container.textContent!,/Confirmado pela API/);assert.match(container.textContent!,/registro original e a correção/);assert.equal(calls.filter(c=>c.method==='POST').length,1);
 }finally{await act(async()=>root.unmount());close();}
});
