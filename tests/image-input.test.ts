import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import ImageInput from '../src/components/image-input';
import ProductForm from '../src/components/product-form';
import {emptyProduct} from '../src/lib/product-draft';
import type {Product} from '../src/lib/domain';
import {clipboardImages,optimizedSize,pastedImages,validateImageFiles} from '../src/lib/image-input';
const file=(type:string)=>new File(['test-image'],type.split('/')[1],{type});
test('clipboard accepts PNG/JPEG/WebP, picks one representation per item and handles denied/missing permission',async()=>{
 for(const type of ['image/png','image/jpeg','image/webp'])assert.equal(validateImageFiles([file(type)]).length,1);
 assert.throws(()=>validateImageFiles([file('image/svg+xml')]),/PNG/);
 assert.deepEqual(optimizedSize(3200,1800),{width:1600,height:900});assert.throws(()=>optimizedSize(10000,10000));
 const first=file('image/png');const data={items:[{kind:'file',type:first.type,getAsFile:()=>first}],files:[first]} as unknown as DataTransfer;
 assert.equal(pastedImages(data).length,1);assert.equal(pastedImages(null).length,0);
 await assert.rejects(clipboardImages(undefined,false),/Ctrl \+ V/);
 await assert.rejects(clipboardImages({read:async()=>{throw new DOMException('denied','NotAllowedError');}},true),/Ctrl \+ V/);
 const result=await clipboardImages({read:async()=>[{types:['image/png','image/jpeg'],getType:async()=>first}] as unknown as ClipboardItems},true);
 assert.equal(result.length,1);assert.equal(result[0].type,'image/png');
});
test('React paste/drop/file events show images immediately, keep them in memory and allow replace/remove',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom');
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://dropou.test'});
 const previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,Image:dom.window.Image,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,active=new Set<string>();let sequence=0,fetches=0;
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{fetches++;throw new Error('No API is allowed in clipboard tests');};
 URL.createObjectURL=()=>{const url='blob:memory-'+(++sequence);active.add(url);return url;};URL.revokeObjectURL=url=>{active.delete(url);};
 Object.defineProperty(dom.window,'isSecureContext',{value:true});Object.defineProperty(dom.window.navigator,'clipboard',{value:{read:async()=>{throw new DOMException('denied','NotAllowedError');}}});
 Object.defineProperty(dom.window.HTMLImageElement.prototype,'decode',{value:async function(this:HTMLImageElement){Object.defineProperty(this,'naturalWidth',{value:800});Object.defineProperty(this,'naturalHeight',{value:1200});}});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'getContext',{value:()=>({fillStyle:'#fff',fillRect(){},drawImage(){}})});
 const container=dom.window.document.getElementById('root')!;const root=createRoot(container);
 const buttons=(text:string)=>Array.from(container.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).filter(b=>b.textContent===text);
 const paste=(files:File[])=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:files.map(f=>({kind:'file',type:f.type,getAsFile:()=>f})),files}});dom.window.document.body.dispatchEvent(event);return event;};
 try{
  await act(async()=>{root.render(createElement(ImageInput,{onImage:()=>{throw new Error('Must not persist captures');},onExtract:()=>{}}));});
  assert.match(container.textContent!,/Cole o print do produto/);
  await act(async()=>{buttons('Colar imagem')[0].click();});assert.match(container.textContent!,/navegador não liberou/);
  await act(async()=>{const event=paste([file('image/png'),file('image/webp')]);assert.equal(event.defaultPrevented,true);});
  assert.equal(container.querySelectorAll('.print-thumbnails img').length,2);
  assert.equal(container.querySelector('.print-thumbnails img')?.getAttribute('src'),'blob:memory-1');
  const area=container.querySelector('[aria-label="Cole o print do produto"]')!;
  await act(async()=>{const drop=new dom.window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[file('image/jpeg')]}});area.dispatchEvent(drop);});
  assert.equal(container.querySelectorAll('.print-thumbnails img').length,3);
  await act(async()=>{paste([file('image/png')]);});assert.equal(container.querySelectorAll('.print-thumbnails img').length,3);assert.match(container.textContent!,/três prints/);
  await act(async()=>{buttons('Substituir')[0].click();});
  const input=container.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async()=>{Object.defineProperty(input,'files',{value:[file('image/webp')],configurable:true});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(container.querySelectorAll('.print-thumbnails img').length,3);assert.equal(active.has('blob:memory-1'),false);
  await act(async()=>{buttons('Remover')[0].click();});assert.equal(container.querySelectorAll('.print-thumbnails img').length,2);
  assert.equal(fetches,0);assert.equal(container.querySelector('button:disabled')?.textContent==='Guardar recorte para publicação',true);
  const saved:{product:Product;caption?:string}[]=[];
  const p:Product={...emptyProduct(),name:'Controle GameSir T4 Nova Lite',price:160.34,previousPrice:299,affiliateUrl:'https://meli.la/test?tracking=original',dataOrigin:'screenshot',paymentMethod:'pix',features:['Hall Effect'],creativeHeadline:'🎮 MAIS CONTROLE PARA SUAS PARTIDAS!',creativeBrand:'dropou'};
  await act(async()=>root.render(createElement(ProductForm,{product:p,onClose:()=>{},onSave:async(product,caption)=>{saved.push({product,caption});}})));
  assert.equal(active.size,0);
  const checkbox=(prefix:string)=>Array.from(container.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).find(label=>label.textContent?.includes(prefix))?.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async()=>checkbox('Conferi ou corrigi').click());await act(async()=>checkbox('Conferi agora na loja').click());
  await act(async()=>container.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved.length,1);assert.equal(saved[0].product.affiliateUrl,p.affiliateUrl);assert.equal(saved[0].product.inStock,true);assert.equal(saved[0].product.pixVerified,true);assert.equal(saved[0].product.screenshotConfirmed,true);assert.ok(saved[0].product.checkedAt);
  assert.match(saved[0].caption!,/MAIS CONTROLE/);assert.match(saved[0].caption!,/138,66/);assert.equal(fetches,0);
 }finally{
  await act(async()=>root.unmount());assert.equal(active.size,0);dom.window.close();URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.fetch=originalFetch;
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
 }
});
