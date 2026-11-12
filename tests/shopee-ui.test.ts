import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import OfferAutomation,{type AutomationData} from '../src/components/offer-automation';
import {defaultShopeeConfig} from '../src/lib/shopee-automation';
import type {api} from '../src/lib/api';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
test('Shopee UI starts without postings, exposes review/budget controls and leaves other niches disabled',()=>{
 const data:AutomationData={config:defaultShopeeConfig(),offers:[],requests:[],runs:[],jobs:[],day:'2026-11-11',globalUsed:0,globalLimit:10,dispatcherEnabled:false,operationEnabled:false,destination:null,verified:false,credentialsReady:false,liveReleased:false,testReady:false};
 const html=renderToStaticMarkup(createElement(OfferAutomation,{operation:'dropou',initialData:data})),doc=new JSDOM(html).window.document;
 assert.match(html,/Modo de teste · sem postagem real/);assert.equal(doc.querySelector('input[type=checkbox]')?.hasAttribute('checked'),false);assert.equal(doc.querySelectorAll('input[type=checkbox]')[1].hasAttribute('checked'),true);assert.ok([...doc.querySelectorAll('button')].find(b=>b.textContent?.includes('Buscar ofertas agora'))?.disabled);assert.match(html,/09:00, 12:30, 16:30, 20:30/);assert.match(html,/Nenhuma publicação real/);assert.ok(!html.includes('ENVIAR SOMENTE'));
 for(const operation of ['bruto','moda','all'] as const){const other=renderToStaticMarkup(createElement(OfferAutomation,{operation}));assert.match(other,/continuam sem busca ou publicação Shopee automática/);assert.ok(!other.includes('<form'));}
 assert.ok(doc.querySelector('input[value="1000"]'));assert.ok(doc.querySelector('input[value="4.6"]'));assert.ok(doc.querySelector('input[value="15"]'));assert.match(html,/Desconto mínimo quando informado/);assert.match(html,/Fontes de busca/);assert.match(html,/Selecionados no planejamento/);
});
test('curation and saved configuration use explicit requests, show errors and never invoke AI or Telegram automatically',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!),calls:{path:string;method:string;body:any}[]=[],data:AutomationData={config:defaultShopeeConfig(),offers:[{id:crypto.randomUUID(),data:{itemId:'9001',shopId:'8001',name:'Controle PC Xbox Bluetooth',price:180,priceMax:180,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/8001/9001',rating:4.8,sales:1000,commission:0.1,reportedDiscount:70,checkedAt:new Date().toISOString()},score:80,eligible:true,reasons:[],decision:'found'}],requests:[],runs:[],jobs:[],day:'2026-11-11',globalUsed:0,globalLimit:10,dispatcherEnabled:false,operationEnabled:false,destination:null,verified:false,credentialsReady:true,liveReleased:false,testReady:false};
 for(const name of ['SSD NVMe Kingston 1TB','Headset Gamer HyperX','Creatina','Kit Shampoo','Batedor USB'])data.offers.push({...structuredClone(data.offers[0]),id:crypto.randomUUID(),data:{...data.offers[0].data,name}});
 const request=(async(path:string,method='GET',body:any)=>{calls.push({path,method,body});assert.ok(!/\/ai\/|\/test-telegram|\/offers\//.test(path));if(method==='GET')return structuredClone(data);if(method==='PATCH'){data.config=body;return {config:body};}if(body.action==='decide'){data.offers.find(o=>o.id===body.id)!.decision=body.decision;return {updated:true,productId:body.id};}if(body.action==='search')throw new Error('Orçamento diário esgotado.');return {};}) as typeof api;
 const approved:string[]=[];
 const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 try{
  await act(async()=>root.render(createElement(OfferAutomation,{operation:'dropou',initialData:data,request,onApproved:id=>approved.push(id)})));assert.equal(calls.length,0);
  assert.equal(document.querySelectorAll('.automation-offer').length,3);assert.equal(document.querySelector<HTMLSelectElement>('select[aria-label="Mostrar produtos Games e Tech"]')!.value,'eligible');assert.ok(!document.body.textContent!.includes('Creatina'));assert.ok(!document.body.textContent!.includes('Shampoo'));assert.ok(!document.body.textContent!.includes('Batedor'));assert.ok(document.querySelector('.automation-hero'));assert.ok(document.querySelector('details>summary')?.textContent?.includes('Filtros e rotina'));
  assert.match(document.body.textContent!,/Confiança dos dados/);assert.match(document.body.textContent!,/Vendas: .*\/40/);assert.match(document.body.textContent!,/histórico insuficiente/);
  const firstId=document.querySelector('.automation-offer')!.getAttribute('data-offer-id')!;
  await act(async()=>button('Aprovar').click());assert.equal(calls[0].body.action,'decide');assert.equal(calls[0].body.decision,'approved');assert.equal(button('Aprovado').disabled,true);assert.deepEqual(approved,[firstId]);
  assert.equal(document.querySelectorAll('.automation-approve:not(:disabled)').length,2);
  await act(async()=>button('Rejeitar').click());assert.equal(document.querySelectorAll('.automation-offer').length,2);assert.ok(!document.querySelector(`[data-offer-id="${firstId}"]`));
  const removedId=document.querySelector('.automation-offer')!.getAttribute('data-offer-id')!;
  await act(async()=>button('Remover da fila').click());assert.equal(document.querySelectorAll('.automation-offer').length,1);
  await act(async()=>button('Atualizar painel').click());assert.equal(document.querySelectorAll('.automation-offer').length,1);
  const remainingId=document.querySelector('.automation-offer')!.getAttribute('data-offer-id')!;
  await act(async()=>button('Aprovar').click());assert.equal(data.offers.find(o=>o.id===remainingId)!.decision,'approved');assert.deepEqual(approved,[firstId,remainingId]);assert.equal(data.offers.find(o=>o.id===firstId)!.decision,'rejected');assert.equal(data.offers.find(o=>o.id===removedId)!.decision,'removed');
  await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.find(c=>c.method==='PATCH')?.body.enabled,true);assert.equal(data.config.dryRun,true);
  await act(async()=>button('Buscar ofertas agora').click());assert.match(document.querySelector('.automation-status')!.textContent!,/Orçamento diário/);assert.ok(document.body.textContent!.includes('Nenhuma publicação real'));assert.equal(calls.filter(c=>c.body?.action==='search').length,1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
