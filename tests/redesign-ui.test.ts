import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import BrandSelector from '../src/components/brand-selector';
import OfferPreview from '../src/components/offer-preview';
import {workspaceBrands,WorkspaceBrandId} from '../src/lib/workspace-brands';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import {safePublicationCaption} from '../src/lib/publication-copy';
import {dropouCalls} from '../src/lib/dropou-captions';
import PublicationActions from '../src/components/publication-actions';
import type {Offer} from '../src/lib/offers';
import type {api} from '../src/lib/api';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}
test('brand selector supports keyboard, six operational brands and the administrative view without paid calls',async()=>{
 const {container,dom,close}=fixture(),root=createRoot(container);let calls=0;const http=fetch;globalThis.fetch=async()=>{calls++;throw new Error('Brand switching must never fetch');};
 function Preview(){const [brand,setBrand]=useState<WorkspaceBrandId>('dropou');return createElement('div',null,createElement(BrandSelector,{value:brand,onChange:setBrand}),createElement('div',{'data-testid':'selected-operation'},brand));}
 const button=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>root.render(createElement(Preview)));await act(async()=>button('Dropou').click());assert.equal(container.querySelectorAll('[role=option]').length,7);assert.equal(container.querySelectorAll('[role=option][aria-selected=true]').length,1);
  const selected=document.activeElement!;await act(async()=>selected.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));assert.match(document.activeElement!.textContent!,/Bruto/);
  await act(async()=>button('Bruto & Barato').click());assert.equal(container.querySelector('[data-testid=selected-operation]')!.textContent,'bruto');assert.equal(container.querySelector('.publication-section'),null);assert.equal(container.querySelector('input'),null);
  await act(async()=>button('Bruto & Barato').click());await act(async()=>button('Dropou').click());assert.equal(container.querySelector('[data-testid=selected-operation]')!.textContent,'dropou');await act(async()=>button('Dropou').click());await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(container.querySelector('[role=listbox]'),null);assert.equal(container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),'false');
  assert.equal(calls,0);assert.deepEqual(workspaceBrands.map(b=>b.status),['Ativo','Ativo','Ativo','A configurar','A configurar','A configurar','Consolidado']);
 }finally{await act(async()=>root.unmount());globalThis.fetch=http;close();}
});
test('one save approves the displayed Dropou offer, unlocks publishing, survives stale props/reload and never calls generation',async()=>{
 const {container,close}=fixture(),root=createRoot(container),p={...emptyProduct(),name:'Controle GameSir T4',price:160.34,affiliateUrl:'https://meli.la/original',checkedAt:null,inStock:null},caption=formatCaption(p),old:Offer={id:crypto.randomUUID(),product_id:p.id,caption,original_caption:caption,snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt};
 const confirmedAt=new Date().toISOString(),fresh:Offer={...old,status:'pronto',updated_at:confirmedAt,snapshot:{...p,status:'pronto',checkedAt:confirmedAt,inStock:true}},requests:string[]=[];
 const request=(async(path:string,method='GET',body?:any)=>{requests.push(path);assert.ok(!path.includes('/ai/'));if(path==='/api/offers'){assert.equal(method,'POST');assert.equal(body.review,true);assert.deepEqual(body.expected,p);assert.equal(body.caption,caption);return {offer:fresh,serverNow:confirmedAt};}throw new Error('Unexpected '+path);}) as typeof api;
 const props={product:p,offer:old,request,context:{serverNow:confirmedAt},onRefresh:async()=>{},onClose(){},onEdit(){}};
 const button=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===text)!;
 try{
  await act(async()=>root.render(createElement(OfferPreview,props)));assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Copiar para WhatsApp').disabled,true);assert.equal(button('Publicar agora no Telegram').disabled,true);
  assert.equal(button('Conferi agora'),undefined);assert.equal(container.querySelector('.offer-condition'),null);assert.equal(requests.length,0);await act(async()=>button('Salvar oferta').click());assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Publicar agora no Telegram').disabled,false);assert.equal(requests.length,1);
  await act(async()=>root.render(createElement(OfferPreview,{...props,product:{...p},offer:{...old}})));assert.equal(container.querySelector('.offer-condition'),null);assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);
  assert.equal(button('Continuar sem conferir'),undefined);assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Publicar agora no Telegram').disabled,false);
  await act(async()=>root.render(createElement(OfferPreview,{...props,key:'reloaded',product:fresh.snapshot,offer:fresh,context:{serverNow:confirmedAt}})));assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Copiar para WhatsApp').disabled,false);assert.equal(requests.length,1);
 }finally{await act(async()=>root.unmount());close();}
});
test('dark tokens, responsive layouts and reduced motion are shared; operational brands share the workspace and preserve existing creative profiles',()=>{
 const css=readFileSync('src/app/workspace.css','utf8'),dashboard=readFileSync('src/components/dashboard.tsx','utf8');
 assert.match(css,/--primary:#FF6A1A/);assert.match(css,/--primary-ink:#0B0B0D/);assert.match(css,/--success:#4ade80/);assert.match(css,/--warning:#fbbf24/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:720px\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert.ok(!css.includes('backdrop-filter'));assert.ok(!css.includes('infinite;border-radius'));
 assert.ok(!dashboard.includes('BrandPreparation'));assert.match(dashboard,/selectOperation\(brand\)/);const ai=readFileSync('src/lib/ai.ts','utf8');for(const profile of ['dropou','barato','linda','bruto','moda'])assert.ok(ai.includes(profile+':{name:'));
});
test('simple Dropou flow saves once and publishes the shown photo/caption without mandatory media checkboxes or extra reconfirm requests',async()=>{
 const {container,close}=fixture(),root=createRoot(container),p={...emptyProduct(),name:'Controle Bluetooth',price:157.88,image:'https://example.com/product.jpg',affiliateUrl:'https://s.shopee.com.br/fixture',store:'Shopee' as const,checkedAt:null},caption=formatCaption(p),offer:Offer={id:crypto.randomUUID(),product_id:p.id,caption,snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt};
 const time=new Date().toISOString(),fresh:Offer={...offer,status:'pronto',updated_at:time,snapshot:{...p,inStock:true,checkedAt:time,status:'pronto'}},calls:{path:string;method:string}[]=[];const submissions:any[]=[];
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method});if(path==='/api/offers'){assert.equal(body.review,true);assert.equal(body.caption,caption);return {offer:fresh,serverNow:time};}if(path==='/api/publication-config')return {enabled:true,telegram:{available:true,title:'Canal fixture',key:'a'.repeat(64)}};if(path.endsWith('/telegram')){submissions.push(body);return {sent:true};}if(path.endsWith('/offer'))return {jobs:[],delivery:{state:'sent',message_ids:['18']}};throw new Error('Unexpected '+path);}) as typeof api;
 const button=(name:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
 try{
  await act(async()=>root.render(createElement(OfferPreview,{product:p,offer,request,context:{jobs:[]},onRefresh:async()=>{},onClose(){},onEdit(){}})));
  assert.equal(calls.length,0);assert.equal(button('Conferi agora'),undefined);await act(async()=>button('Salvar oferta').click());assert.equal(button('Publicar agora no Telegram').disabled,false);
  await act(async()=>button('Publicar agora no Telegram').click());const dialog=container.querySelector('.quick-publication')!;assert.ok(dialog);assert.equal(dialog.querySelectorAll('input[type=checkbox]').length,0);assert.match(dialog.textContent!,/157,88/);assert.match(dialog.textContent!,/Canal fixture/);assert.equal(submissions.length,0);
  await act(async()=>button('Confirmar envio ao Telegram').click());const sent=submissions[0];assert.ok(sent);assert.equal(sent.caption,caption);assert.equal(sent.photoConfirmed,true);assert.equal(sent.mediaMode,'photo');assert.equal(sent.confirmed,true);assert.equal(sent.targetKey,'a'.repeat(64));assert.ok(!calls.some(c=>c.path.includes('/reconfirm')||c.path.includes('/ai/')));assert.equal(calls.filter(c=>c.method==='POST').length,2);
 }finally{await act(async()=>root.unmount());close();}
});
test('free gamer rotation changes only the opening, preserves manual edits and saves the final version without AI',async()=>{
 const {container,close}=fixture(),root=createRoot(container),p={...emptyProduct(),name:'Controle PC Bluetooth',price:149.9,affiliateUrl:'https://meli.la/original',inStock:true,checkedAt:new Date().toISOString()},caption=formatCaption(p).replace('🎮 *','🎮 Minha edição *');
 let saved:Offer={id:crypto.randomUUID(),product_id:p.id,caption,original_caption:formatCaption(p),manually_edited:true,snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt};const requests:string[]=[];
 const request=(async(path:string,_method='GET',body?:any)=>{requests.push(path);if(path.endsWith('/headline')){assert.equal(body.current,caption);return {headline:dropouCalls.controls[1]};}if(path==='/api/offers'){assert.equal(body.caption,dropouCalls.controls[1]+caption.slice(caption.indexOf('\n\n')));saved={...saved,caption:body.caption,manually_edited:true};return {offer:saved};}throw new Error('Unexpected '+path);}) as typeof api;
 const button=(label:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
 try{await act(async()=>root.render(createElement(OfferPreview,{product:p,offer:saved,request,onRefresh:async()=>{},onClose(){},onEdit(){}})));await act(async()=>button('Gerar outra chamada').click());await act(async()=>button('Salvar oferta').click());assert.equal(requests.length,2);assert.ok(requests.every(p=>!p.includes('/ai/')));assert.ok(saved.caption.includes(p.affiliateUrl));assert.match(saved.caption,/Minha edição/);
 }finally{await act(async()=>root.unmount());close();}
});
test('quick scheduling opens with configured slots even when the price needs checking, and opening never schedules or sends',async()=>{
 const {container,close}=fixture(),root=createRoot(container),now=Date.parse('2026-11-12T10:00:00-03:00'),p={...emptyProduct(),name:'SSD NVMe 1TB',price:299.9,affiliateUrl:'https://meli.la/original',checkedAt:new Date(now-16*60000).toISOString()},caption=formatCaption(p),offer={id:crypto.randomUUID(),product_id:p.id,caption,snapshot:p,status:'rascunho'} as Offer,calls:string[]=[];
 const request=(async(path:string,method='GET')=>{calls.push(method+' '+path);assert.equal(path,'/api/publication-config');return {enabled:false,slots:['09:00','12:30','20:30'],serverNow:new Date(now).toISOString(),telegram:{available:true,title:'Canal fixture',key:'a'.repeat(64)}};}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationActions,{product:p,offer,text:caption,now,preference:'priced',initialAction:'schedule',request,save:async()=>offer,onUpdate:async()=>{},onEdit(){}})));const modal=container.querySelector('[role=dialog]')!;assert.ok(modal);assert.match(modal.textContent!,/Hoje · 12:30/);assert.doesNotMatch(modal.textContent!,/Hoje · 09:00/);const input=modal.querySelector<HTMLInputElement>('input[type=datetime-local]')!;assert.equal(input.value,'2026-11-12T12:30');const later=[...modal.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Hoje · 20:30')!;await act(async()=>later.click());assert.equal(input.value,'2026-11-12T20:30');assert.equal([...modal.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Confirmar agendamento')!.disabled,true);assert.match(modal.textContent!,/R\$/);assert.deepEqual(calls,['GET /api/publication-config']);
 }finally{await act(async()=>root.unmount());close();}
});
test('gamer schedule completes after explicit price checking and presentation choice, preserving price and disabling safe fallback',async()=>{
 const {container,close}=fixture(),root=createRoot(container),now=Date.parse('2026-11-13T10:00:00-03:00'),p={...emptyProduct(),name:'SSD NVMe 1TB',price:299.9,affiliateUrl:'https://meli.la/original',checkedAt:new Date(now-16*60000).toISOString()},caption=formatCaption(p),offer={id:crypto.randomUUID(),product_id:p.id,caption,snapshot:p,status:'rascunho'} as Offer;
 let scheduled:any;const fresh={...offer,snapshot:{...p,inStock:true,checkedAt:new Date(now).toISOString(),status:'pronto' as const},status:'pronto' as const};
 const request=(async(path:string,method='GET',body?:any)=>{if(path==='/api/publication-config')return {enabled:true,slots:['12:30','20:30'],serverNow:new Date(now).toISOString(),telegram:{available:true,title:'Fixture',key:'a'.repeat(64)}};if(path.endsWith('/reconfirm')){assert.equal(body.confirmed,true);return {offer:fresh,serverNow:new Date(now).toISOString()};}if(path.endsWith('/schedule')){assert.equal(method,'POST');scheduled=body;return {job:{state:'queued'}};}if(path.endsWith('/offer'))return {jobs:[]};throw new Error('Unexpected '+path);}) as typeof api;
 function Flow(){const [current,setCurrent]=useState(offer);return createElement(PublicationActions,{product:current.snapshot,offer:current,text:caption,now,preference:'priced',initialAction:'schedule',request,save:async()=>current,onUpdate:async(updated?:Offer)=>{if(updated)setCurrent(updated);},onEdit(){}});}
 try{await act(async()=>root.render(createElement(Flow)));let modal=container.querySelector('[role=dialog]')!;await act(async()=>[...modal.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Conferi agora')!.click());modal=container.querySelector('[role=dialog]')!;await act(async()=>[...modal.querySelectorAll<HTMLLabelElement>('label')].find(l=>l.textContent==='Publicar somente texto, sem prévia')!.querySelector<HTMLInputElement>('input')!.click());await act(async()=>[...modal.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Hoje · 20:30')!.click());const confirm=[...modal.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Confirmar agendamento')!;assert.equal(confirm.disabled,false);await act(async()=>confirm.click());assert.equal(scheduled.caption,caption);assert.equal(scheduled.sourceCaption,caption);assert.equal(scheduled.mode,'verified');assert.equal(scheduled.allowSafe,false);assert.equal(scheduled.scheduledAt,'2026-11-13T23:30:00.000Z');assert.equal(scheduled.mediaMode,'text');assert.equal(container.querySelector('[role=dialog]'),null);
 }finally{await act(async()=>root.unmount());close();}
});
