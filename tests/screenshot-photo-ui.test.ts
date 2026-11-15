import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import ScreenshotPhoto,{type PreparedScreenshot} from '../src/components/screenshot-photo';
import ProductOperations,{type OperationsData} from '../src/components/product-operations';
import type {api} from '../src/lib/api';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=dropou&view=curation'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,Image:dom.window.Image,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}
test('manual photo selection, original fallback and no-photo choice require consent, survive delayed OCR and release memory',async()=>{
 const {dom,container,close}=fixture(),root=createRoot(container),create=URL.createObjectURL,revoke=URL.revokeObjectURL,http=globalThis.fetch,active=new Set<string>(),draws:any[][]=[];let next=0,prepared:PreparedScreenshot|undefined;
 URL.createObjectURL=()=>{const url='blob:photo-'+(++next);active.add(url);return url;};URL.revokeObjectURL=url=>{active.delete(url);};globalThis.fetch=async()=>{throw new Error('No upload or paid API during photo review');};
 Object.defineProperty(dom.window.HTMLImageElement.prototype,'decode',{value:async function(this:HTMLImageElement){Object.defineProperty(this,'naturalWidth',{value:800});Object.defineProperty(this,'naturalHeight',{value:500});}});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'getContext',{value:()=>({fillStyle:'#fff',fillRect(){},drawImage(...args:any[]){draws.push(args);},getImageData(_x:number,_y:number,w:number,h:number){return {data:new Uint8ClampedArray(w*h*4).fill(255)};}})});
 Object.defineProperty(dom.window.HTMLCanvasElement.prototype,'toBlob',{value:(callback:(blob:Blob)=>void)=>callback(new Blob(['original-pixels'],{type:'image/jpeg'}))});
 const shot={id:'capture',url:'blob:original',file:new File(['capture'],'capture.png',{type:'image/png'}),crop:{x:0,y:0,w:100,h:100}},onPrepared=(value:PreparedScreenshot)=>{prepared=value;};
 const button=(text:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 try{
  await act(async()=>root.render(createElement(ScreenshotPhoto,{shot,onPrepared})));assert.equal(prepared?.blob,undefined);assert.equal(prepared?.approved,false);
  await act(async()=>button('Ajustar recorte').click());assert.ok(prepared?.blob);assert.equal(prepared?.approved,false);assert.ok(draws.some(args=>args.length===9&&args[3]===440&&args[4]===325));
  await act(async()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());assert.equal(prepared?.approved,true);
  await act(async()=>root.render(createElement(ScreenshotPhoto,{shot,onPrepared,words:[{text:'R$ 99,00',confidence:95,x:.1,y:.1,w:.3,h:.1}]})));assert.equal(prepared?.approved,true);assert.ok(container.querySelector('.screenshot-crop-outline'));
  await act(async()=>button('Usar captura original').click());assert.equal(prepared?.mode,'original');assert.equal(prepared?.approved,false);assert.ok(draws.some(args=>args[3]===800&&args[4]===500));
  await act(async()=>button('Ajustar recorte').click());assert.equal(prepared?.mode,'crop');assert.equal(prepared?.approved,false);
  await act(async()=>button('Manter imagem atual / não usar recorte').click());assert.equal(prepared?.mode,'none');assert.equal(prepared?.blob,undefined);assert.equal(prepared?.approved,true);assert.equal(active.size,0);
 }finally{await act(async()=>root.unmount());assert.equal(active.size,0);URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.fetch=http;close();}
});
test('curation keeps the provider failure visible after reloading existing products and never retries search automatically',async()=>{
 const {container,close}=fixture(),root=createRoot(container);const data:OperationsData={rows:[],total:0,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}},requests:{path:string;method:string}[]=[];
 const request=(async(path:string,method='GET')=>{requests.push({path,method});if(method==='POST')return {status:'failed',message:'A busca não foi concluída. Os produtos existentes foram preservados.',errors:['Shopee indisponível. A tentativa foi contabilizada.'],retryAt:new Date(Date.now()+60000).toISOString()};return data;}) as typeof api;
 try{await act(async()=>root.render(createElement(ProductOperations,{mode:'curation',initialData:data,request,onOpen(){},onNavigate(){}})));await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Buscar produtos')!.click());assert.match(container.querySelector('[role=alert]')!.textContent!,/Shopee indisponível.*Aguarde/);assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.equal(requests.filter(r=>r.path.startsWith('/api/product-operations')).length,1);assert.doesNotMatch(container.querySelector('[role=alert]')!.textContent!,/0 resultado/);}finally{await act(async()=>root.unmount());close();}
});
