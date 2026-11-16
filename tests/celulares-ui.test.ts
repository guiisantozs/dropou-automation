import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import ProductOperations,{type OperationsData} from '../src/components/product-operations';
import WhatsappChannelPublication from '../src/components/whatsapp-channel-publication';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import {defaultCelularesConfig} from '../src/lib/celulares-curation';
import type {api} from '../src/lib/api';
import type {Offer} from '../src/lib/offers';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=celulares&view=curation'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,root:createRoot(document.getElementById('root')!),close(){dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}
test('Celulares filters and ordering reload only the internal cache; opening configuration never starts discovery',async()=>{
 const {dom,container,root,close}=fixture(),requests:{path:string;method:string;body?:any}[]=[],data:OperationsData={rows:[],total:0,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}};
 const request=(async(path:string,method='GET',body?:any)=>{requests.push({path,method,body});if(path.includes('curation-config'))return {config:defaultCelularesConfig(),admin:false,dailyLimit:8};if(method==='POST')return {status:'complete',message:'Busca concluída'};return data;}) as typeof api;
 const button=(name:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
 try{
  await act(async()=>root.render(createElement(ProductOperations,{operation:'celulares',mode:'curation',initialData:data,request,onOpen(){},onNavigate(){}})));assert.equal(requests.length,0);
  await act(async()=>button('Smartphones').click());assert.ok(requests.some(r=>r.path.includes('category=smartphones')&&r.method==='GET'));assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await act(async()=>{const select=container.querySelector<HTMLSelectElement>('[aria-label="Ordenar curadoria"]')!;select.value='discount';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.ok(requests.some(r=>r.path.includes('sort=discount')));
  const details=container.querySelector<HTMLDetailsElement>('.celulares-curation-settings')!;await act(async()=>{details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));});assert.equal(container.querySelector('.celulares-curation-settings fieldset')?.matches(':disabled'),true);assert.equal(button('Salvar critérios'),undefined);assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await act(async()=>button('Buscar produtos').click());assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.equal(requests.find(r=>r.method==='POST')?.path,'/api/shopee/automation?brand=celulares');
 }finally{await act(async()=>root.unmount());close();}
});
test('WhatsApp copies the approved caption without marking and confirms only the chosen authorized destination',async()=>{
 const {dom,container,root,close}=fixture(),p={...emptyProduct(),operation:'celulares' as const,name:'Fone Bluetooth JBL',store:'Shopee' as const,price:199.9,checkedAt:new Date().toISOString(),inStock:true,affiliateUrl:'https://shope.ee/fixture'},caption=formatCaption(p,'celulares'),offer:Offer={id:crypto.randomUUID(),product_id:p.id,snapshot:p,caption,status:'pronto',created_at:p.createdAt,updated_at:p.createdAt},calls:any[]=[];let clipboard='',updated=0;
 Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async(text:string)=>{clipboard=text;}}});
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='PATCH')return {marked:true};if(path.endsWith('/offer'))return {product:p,offer,serverNow:new Date().toISOString()};return {whatsappOptions:[{brand:'celulares',name:'Celulares & Gadgets',title:'Grupo Celulares',url:'https://chat.whatsapp.com/Fixture',available:true,published:false,reason:''},{brand:'dropou',name:'Tech & Games',title:'Grupo Tech',url:'https://chat.whatsapp.com/Other',available:true,published:false,reason:''},{brand:'automoto',name:'Auto & Moto',title:'Sem grupo',available:false,published:false,reason:'Configure o destino'}]};}) as typeof api;
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
 try{
  await act(async()=>root.render(createElement(WhatsappChannelPublication,{product:p,offer,text:caption,disabled:false,request,onUpdate:async()=>{updated++;}})));assert.equal(calls.length,0);
  await act(async()=>button('WhatsApp em canais').click());assert.equal(calls.length,1);assert.equal(button('Confirmar publicação em Celulares & Gadgets').disabled,true);assert.equal(button('Confirmar publicação em Auto & Moto'),undefined);
  await act(async()=>button('Copiar legenda aprovada').click());assert.equal(clipboard,caption,dom.window.document.body.textContent!);assert.equal(calls.filter(c=>c.method==='PATCH').length,0);
  await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await act(async()=>button('Confirmar publicação em Celulares & Gadgets').click());const posted=calls.find(c=>c.method==='PATCH');assert.equal(posted.body.brand,'celulares');assert.equal(posted.body.confirmed,true);assert.equal(posted.body.caption,caption);assert.equal(calls.filter(c=>c.method==='PATCH').length,1);assert.equal(updated,1);assert.equal(button('Confirmar publicação em Celulares & Gadgets'),undefined);assert.ok(button('Confirmar publicação em Tech & Games'));
 }finally{await act(async()=>root.unmount());close();}
});
