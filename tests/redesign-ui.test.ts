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
import type {Offer} from '../src/lib/offers';
import type {api} from '../src/lib/api';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}
test('brand selector supports keyboard, three operational brands and the administrative view without paid calls',async()=>{
 const {container,dom,close}=fixture(),root=createRoot(container);let calls=0;const http=fetch;globalThis.fetch=async()=>{calls++;throw new Error('Brand switching must never fetch');};
 function Preview(){const [brand,setBrand]=useState<WorkspaceBrandId>('dropou');return createElement('div',null,createElement(BrandSelector,{value:brand,onChange:setBrand}),createElement('div',{'data-testid':'selected-operation'},brand));}
 const button=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>root.render(createElement(Preview)));await act(async()=>button('Dropou').click());assert.equal(container.querySelectorAll('[role=option]').length,4);assert.equal(container.querySelectorAll('[role=option][aria-selected=true]').length,1);
  const selected=document.activeElement!;await act(async()=>selected.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));assert.match(document.activeElement!.textContent!,/Bruto/);
  await act(async()=>button('Bruto & Barato').click());assert.equal(container.querySelector('[data-testid=selected-operation]')!.textContent,'bruto');assert.equal(container.querySelector('.publication-section'),null);assert.equal(container.querySelector('input'),null);
  await act(async()=>button('Bruto & Barato').click());await act(async()=>button('Dropou').click());assert.equal(container.querySelector('[data-testid=selected-operation]')!.textContent,'dropou');await act(async()=>button('Dropou').click());await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(container.querySelector('[role=listbox]'),null);assert.equal(container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),'false');
  assert.equal(calls,0);assert.deepEqual(workspaceBrands.map(b=>b.status),['Ativo','Ativo','Ativo','Consolidado']);
 }finally{await act(async()=>root.unmount());globalThis.fetch=http;close();}
});
test('confirmation immediately replaces safe preview with full copy, survives stale props and reload, and never calls generation',async()=>{
 const {container,close}=fixture(),root=createRoot(container),p={...emptyProduct(),name:'Controle GameSir T4',price:160.34,affiliateUrl:'https://meli.la/original',checkedAt:new Date(Date.now()-16*60000).toISOString(),inStock:true},caption=formatCaption(p),old:Offer={id:crypto.randomUUID(),product_id:p.id,caption,original_caption:caption,snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt};
 const confirmedAt=new Date().toISOString(),fresh:Offer={...old,status:'pronto',updated_at:confirmedAt,snapshot:{...p,status:'pronto',checkedAt:confirmedAt,inStock:true}},requests:string[]=[];
 const request=(async(path:string,method='GET',body?:any)=>{requests.push(path);assert.ok(!path.includes('/ai/'));if(path.endsWith('/reconfirm')){assert.equal(method,'POST');assert.equal(body.confirmed,true);assert.deepEqual(body.expected,p);return {offer:fresh,serverNow:confirmedAt};}throw new Error('Unexpected '+path);}) as typeof api;
 const props={product:p,offer:old,request,context:{serverNow:confirmedAt},onRefresh:async()=>{},onClose(){},onEdit(){}};
 const button=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===text)!;
 try{
  await act(async()=>root.render(createElement(OfferPreview,props)));assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Preparar para WhatsApp').disabled,true);assert.equal(button('Publicar agora no Telegram').disabled,true);
  await act(async()=>button('Conferi agora').click());assert.match(container.querySelector('.offer-condition')!.textContent!,/Preço conferido agora/);assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Publicar agora no Telegram').disabled,false);assert.equal(requests.length,1);
  await act(async()=>root.render(createElement(OfferPreview,{...props,product:{...p},offer:{...old}})));assert.match(container.querySelector('.offer-condition')!.textContent!,/Preço conferido agora/);assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);
  assert.equal(button('Continuar sem conferir'),undefined);assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Publicar agora no Telegram').disabled,false);
  await act(async()=>root.render(createElement(OfferPreview,{...props,key:'reloaded',product:fresh.snapshot,offer:fresh,context:{serverNow:confirmedAt}})));assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal(button('Preparar para WhatsApp').disabled,false);assert.equal(requests.length,1);
 }finally{await act(async()=>root.unmount());close();}
});
test('dark tokens, responsive layouts and reduced motion are shared; operational brands share the workspace and preserve existing creative profiles',()=>{
 const css=readFileSync('src/app/workspace.css','utf8'),dashboard=readFileSync('src/components/dashboard.tsx','utf8');
 assert.match(css,/--primary:#FF6A1A/);assert.match(css,/--primary-ink:#0B0B0D/);assert.match(css,/--success:#4ade80/);assert.match(css,/--warning:#fbbf24/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:720px\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert.ok(!css.includes('backdrop-filter'));assert.ok(!css.includes('infinite;border-radius'));
 assert.ok(!dashboard.includes('BrandPreparation'));assert.match(dashboard,/selectOperation\(brand\)/);const ai=readFileSync('src/lib/ai.ts','utf8');for(const profile of ['dropou','barato','linda','bruto','moda'])assert.ok(ai.includes(profile+':{name:'));
});
