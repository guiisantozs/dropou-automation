import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import PublicationActions from '../src/components/publication-actions';
import ImageInput from '../src/components/image-input';
import {ImagePreparation} from '../src/lib/image-preparation';
import {copyImage} from '../src/lib/share';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import type {Offer} from '../src/lib/offers';
import type {api} from '../src/lib/api';
function domFixture(){
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,Image:dom.window.Image,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 return {dom,container:document.getElementById('root')!,restore(){dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};
}
test('saved offer enables manual preparation, explains blocks and confirms Telegram destination without duplicate calls or AI',async()=>{
 const {dom,container,restore}=domFixture(),root=createRoot(container),p={...emptyProduct(),name:'Controle de teste',affiliateUrl:'https://meli.la/test',price:160,checkedAt:new Date().toISOString(),inStock:true,status:'pronto' as const},text=formatCaption(p),offer={id:crypto.randomUUID(),product_id:p.id,caption:text,snapshot:p,status:'pronto'} as Offer;
 const calls:string[]=[],copied:string[]=[];Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{copied.push(text);}}});
 let release:()=>void=()=>{};const sending=new Promise<void>(r=>{release=r;});
 const request=(async(path:string,method='GET',body?:any)=>{
  calls.push(method+' '+path);assert.ok(!path.includes('/ai/'));
  if(path==='/api/publication-config')return {enabled:false,telegram:{available:true,id:'-100123',key:'a'.repeat(64),title:'Canal certo de teste'}};
  if(path.endsWith('/telegram')){assert.equal(body.caption,text);assert.equal(body.targetKey,'a'.repeat(64));assert.equal(body.confirmed,true);await sending;return {sent:true};}
  if(path.endsWith('/offer'))return {publications:[]};throw new Error('Unexpected '+path);
 }) as typeof api;
 const button=(label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===label)!;
 const render=(o:Offer|undefined=offer,t=text)=>root.render(createElement(PublicationActions,{product:p,offer:o,text:t,request,preload:true,context:{},save:async()=>offer,onUpdate:async()=>{},onEdit(){}}));
 try{
  await act(async()=>render());assert.equal(calls.length,0);assert.equal(button('Preparar para WhatsApp').disabled,false);
  await act(async()=>button('Preparar para WhatsApp').click());assert.match(container.textContent!,/não significa enviado/);
  await act(async()=>button('Copiar legenda').click());assert.deepEqual(copied,[text]);
  await act(async()=>button('Publicar agora no Telegram').click());assert.match(container.querySelector('[role=dialog]')!.textContent!,/Canal certo de teste/);assert.equal(calls.filter(c=>c.includes('/telegram')).length,0);
  await act(async()=>{button('Confirmar envio ao Telegram').click();button('Confirmar envio ao Telegram').click();});assert.equal(calls.filter(c=>c.endsWith('/telegram')).length,1);assert.equal(button('Confirmar envio ao Telegram').disabled,true);
  await act(async()=>release());assert.match(container.textContent!,/Telegram confirmou/);
  await act(async()=>render(offer,text+' edição'));assert.equal(button('Preparar para WhatsApp').disabled,true);assert.match(container.querySelector('.action-reason')!.textContent!,/Salve a edição/);
 }finally{release();await act(async()=>root.unmount());restore();}
});
test('ten image-input open/paste/rerender/close cycles release every Object URL and do not replace paste listeners on parent renders',async()=>{
 const {dom,container,restore}=domFixture(),create=URL.createObjectURL,revoke=URL.revokeObjectURL,active=new Set<string>();let seq=0,adds=0,removes=0,requests=0;
 const http=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw new Error('No network');};
 URL.createObjectURL=()=>{const url='blob:fixture-'+(++seq);active.add(url);return url;};URL.revokeObjectURL=url=>{active.delete(url);};
 const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
 window.addEventListener=((type:string,...args:any[])=>{if(type==='paste')adds++;return (add as any)(type,...args);}) as typeof add;
 window.removeEventListener=((type:string,...args:any[])=>{if(type==='paste')removes++;return (remove as any)(type,...args);}) as typeof remove;
 Object.defineProperty(dom.window.HTMLImageElement.prototype,'decode',{value:async function(this:HTMLImageElement){Object.defineProperty(this,'naturalWidth',{value:800});Object.defineProperty(this,'naturalHeight',{value:600});}});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'getContext',{value:()=>({fillRect(){},drawImage(){}})});
 try{
  for(let cycle=0;cycle<10;cycle++){
   const root=createRoot(container);for(let render=0;render<6;render++)await act(async()=>root.render(createElement(ImageInput,{onImage(){},onExtract(){},onChange(){}})));
   const file=new File(['fixture'],'print.png',{type:'image/png'}),event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[file]}});
   await act(async()=>dom.window.document.body.dispatchEvent(event));assert.equal(active.size,1);assert.equal(container.querySelectorAll('.print-thumbnails img').length,1);
   await act(async()=>root.unmount());assert.equal(active.size,0);
  }
  assert.equal(adds,10);assert.equal(removes,10);assert.equal(requests,0);
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.fetch=http;restore();}
});
test('image preparation reuses one decode and compressed Blob per crop, invalidates edits and releases canvas memory; PNG clipboard succeeds',async()=>{
 const {dom,restore}=domFixture();let decodes=0,encodes=0,writes=0;const canvases:HTMLCanvasElement[]=[];
 Object.defineProperty(dom.window.HTMLImageElement.prototype,'decode',{value:async function(this:HTMLImageElement){decodes++;Object.defineProperty(this,'naturalWidth',{value:800});Object.defineProperty(this,'naturalHeight',{value:600});}});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'getContext',{value:function(this:HTMLCanvasElement){if(!canvases.includes(this))canvases.push(this);return {fillRect(){},drawImage(){}};}});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'toBlob',{value:(cb:(b:Blob)=>void)=>{encodes++;cb(new Blob(['fixture'],{type:'image/jpeg'}));}});
 const reader=Object.getOwnPropertyDescriptor(globalThis,'FileReader'),clipboard=Object.getOwnPropertyDescriptor(globalThis,'ClipboardItem');
 Object.defineProperty(globalThis,'FileReader',{configurable:true,value:class{result='data:image/jpeg;base64,Zml4dHVyZQ==';onload=()=>{};readAsDataURL(){this.onload();}}});
 Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:class{constructor(public data:Record<string,Blob>){}}});
 const cache=new ImagePreparation(),shot={id:'fixture',file:new File(['fixture'],'test.png',{type:'image/png'}),url:'blob:fixture',crop:{x:0,y:0,w:100,h:100}};
 try{
  await cache.canvas(shot);await cache.optimized(shot);await cache.optimized(shot);assert.equal(decodes,1);assert.equal(encodes,1);
  await cache.optimized({...shot,crop:{...shot.crop,w:50}});assert.equal(decodes,2);assert.equal(encodes,2);await Promise.resolve();assert.equal(canvases[0].width,0);
  cache.clear();await Promise.resolve();assert.ok(canvases.every(c=>c.width===0&&c.height===0));await assert.rejects(cache.canvas(shot),/cancelado/);
  await copyImage(new Blob(['fixture'],{type:'image/png'}),{write:async items=>{writes++;assert.equal(items.length,1);}});assert.equal(writes,1);
 }finally{cache.clear();if(reader)Object.defineProperty(globalThis,'FileReader',reader);else Reflect.deleteProperty(globalThis,'FileReader');if(clipboard)Object.defineProperty(globalThis,'ClipboardItem',clipboard);else Reflect.deleteProperty(globalThis,'ClipboardItem');restore();}
});
test('dashboard keeps heavy work behind dedicated routes and dynamic imports; OCR only imports after a click',()=>{
 const dashboard=readFileSync('src/components/dashboard.tsx','utf8'),form=readFileSync('src/components/product-form.tsx','utf8'),images=readFileSync('src/components/image-input.tsx','utf8');
 assert.ok(!dashboard.includes("import ProductForm from"));assert.ok(!dashboard.includes("import OfferPreview from"));assert.match(dashboard,/ofertas\/nova/);assert.match(form,/dynamic\(\(\)=>import\('\.\/image-input'\)/);assert.match(images,/await import\('tesseract.js'\)/);assert.ok(!images.includes("import {createWorker} from"));
});
