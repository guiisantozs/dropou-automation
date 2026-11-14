import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import ShopeeSavedProducts,{type SavedShopeeData} from '../src/components/shopee-saved-products';
import type {api} from '../src/lib/api';
import {shopeeProduct} from '../src/lib/shopee-product';
import {dropouCaption} from '../src/lib/dropou-captions';
const item={id:'10000000-0000-4000-8000-000000000003',input_url:'https://shopee.com.br/product/123/456',canonical_url:'https://shopee.com.br/product/123/456',data:{itemId:'456',shopId:'123',name:'Controle PC Bluetooth',price:149.9,priceMax:149.9,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:1000,commission:.08,reportedDiscount:15,checkedAt:'2026-11-13T13:00:00.000Z'},state:'ready' as const,error:null,prepared_product_id:null,created_at:'2026-11-13T13:00:00.000Z',updated_at:'2026-11-13T13:00:00.000Z'};
const fixtureData:SavedShopeeData={products:[item],total:1,more:false,credentialsReady:true,budget:{used:3,limit:8,globalUsed:3,globalLimit:10}};
test('saved Shopee cards show official photo, price and affiliate URL without requesting a screenshot or inventing missing data',()=>{
 const html=renderToStaticMarkup(createElement(ShopeeSavedProducts,{operation:'dropou',initialData:fixtureData,onOpen(){}}));assert.match(html,/Controle PC Bluetooth/);assert.match(html,/susercontent.com/);assert.match(html,/149,90/);assert.match(html,/s.shopee.com.br\/fixture/);assert.ok(!html.includes('type="file"'));assert.match(html,/sem enviar print/);
 const range=renderToStaticMarkup(createElement(ShopeeSavedProducts,{operation:'dropou',initialData:{...fixtureData,products:[{...item,data:{...item.data,priceMax:199.9,rating:null,sales:null}}]},onOpen(){}}));assert.match(range,/A partir de/);assert.match(range,/Revise a variação/);assert.match(range,/Nota não informada/);assert.match(range,/Vendas não informadas/);
});

test('failed imports expose deletion outside collapsed details even without Shopee credentials',()=>{
 const html=renderToStaticMarkup(createElement(ShopeeSavedProducts,{operation:'dropou',initialData:{...fixtureData,credentialsReady:false,products:[{...item,state:'error',data:null,error:'Consulta falhou'}]},onOpen(){}}));
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM(html);
 try{const remove=dom.window.document.querySelector('button[aria-label^="Excluir produto"]') as HTMLButtonElement|null;assert.ok(remove);assert.equal(remove.disabled,false);assert.equal(remove.closest('details'),null);assert.match(dom.window.document.body.textContent!,/7 dias/);assert.match(dom.window.document.body.textContent!,/14 dias/);}finally{dom.window.close();}
});
test('confirmed saved card opens Telegram confirmation and copies the final caption after a fresh read without publishing',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();const copied:string[]=[];
 Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async(value:string)=>{copied.push(value);}}});
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const product={...shopeeProduct({...item.data,checkedAt:new Date().toISOString()}),inStock:true},offer={id:item.id,product_id:product.id,caption:dropouCaption(product),snapshot:product,status:'pronto' as const,created_at:product.createdAt,updated_at:product.createdAt};
 const publication={product,offer,serverNow:new Date().toISOString()},data={...fixtureData,serverNow:publication.serverNow,products:[{...item,prepared_product_id:product.id}],publications:{[product.id]:publication}};
 const root=createRoot(document.getElementById('root')!),opened:unknown[][]=[],calls:{path:string;method:string}[]=[];let expired=false;
 const request=(async(path:string,method='GET')=>{calls.push({path,method});assert.equal(method,'GET');assert.equal(path,'/api/products/'+product.id+'/offer');return expired?{...publication,product:{...product,checkedAt:null}}:publication;}) as typeof api;
 try{
  await act(async()=>root.render(createElement(ShopeeSavedProducts,{operation:'dropou',initialData:data,request,onOpen:(...args)=>{opened.push(args);}})));
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!;
  await act(async()=>button('Postar no Telegram').click());assert.deepEqual(opened,[[product.id,'telegram']]);assert.equal(calls.length,0);
  await act(async()=>button('Copiar para WhatsApp').click());assert.deepEqual(copied,[offer.caption]);assert.equal(calls.length,1);
  expired=true;await act(async()=>button('Copiar para WhatsApp').click());assert.equal(copied.length,1);assert.match(document.body.textContent!,/Confira o preço/);assert.ok(calls.every(c=>c.method==='GET'));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
test('saved card scheduling prepares through the authenticated API and opens the existing flow; deletion removes the saved card after explicit confirmation',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const container=document.getElementById('root')!,root=createRoot(container),calls:{path:string;method:string;body:any}[]=[],opened:any[]=[];let removed=false;
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(method==='DELETE'){removed=true;return {removed:true};}if(method==='POST'){assert.equal(body.action,'prepare');assert.equal(body.id,item.id);return {productId:'10000000-0000-4000-8000-000000000009',needsReview:false};}return {...fixtureData,products:removed?[]:[item],total:removed?0:1};}) as typeof api;
 try{await act(async()=>root.render(createElement(ShopeeSavedProducts,{operation:'dropou',initialData:fixtureData,request,onOpen:(...args)=>{opened.push(args);}})));assert.equal(calls.length,0);const button=(label:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;await act(async()=>button('Agendar publicação').click());assert.deepEqual(opened,[['10000000-0000-4000-8000-000000000009','schedule']]);assert.equal(calls.length,1);assert.ok(calls.every(c=>!c.path.includes('telegram')&&!c.path.includes('/schedule')));await act(async()=>button('Excluir').click());assert.equal(removed,false);assert.ok(container.querySelector('[role=alertdialog]'));await act(async()=>button('Confirmar exclusão').click());assert.equal(container.querySelectorAll('.saved-product-card').length,0);assert.match(container.textContent!,/publicações anteriores foram preservadas/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
