import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import ProductForm from '../src/components/product-form';
import {emptyProduct} from '../src/lib/product-draft';
import {shopeeProduct} from '../src/lib/shopee-product';
import type {Product} from '../src/lib/domain';
import type {api} from '../src/lib/api';
test('ordinary-link form imports only on click and preserves the official affiliate URL, photo and product data',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=tenis'}),old=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const plain='https://shopee.com.br/product/123/456',affiliate='https://s.shopee.com.br/official-fixture';
 const product=shopeeProduct({shopId:'123',itemId:'456',name:'Tênis Olympikus de teste',price:179.9,priceMax:179.9,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:affiliate,productLink:plain,rating:4.8,sales:5000,commission:.1,reportedDiscount:20,checkedAt:new Date().toISOString()},crypto.randomUUID(),'tenis');
 const calls:string[]=[];let saved:Product|undefined;
 const request=(async(path:string,method='GET',body?:any)=>{calls.push(path);if(path.includes('/operations'))return {operations:[]};assert.equal(path,'/api/products/resolve');assert.equal(method,'POST');assert.equal(body.url,plain);return {product};}) as typeof api;
 const root=createRoot(document.getElementById('root')!),button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(text))!;
 try{
  await act(async()=>root.render(createElement(ProductForm,{product:{...emptyProduct(),operation:'tenis',affiliateUrl:plain},request,onSave:async p=>{saved=p;},onClose(){}})));
  assert.equal(calls.filter(p=>p.includes('/resolve')).length,0);
  await act(async()=>button('Tentar dados oficiais').click());assert.equal(calls.filter(p=>p.includes('/resolve')).length,1);
  assert.ok([...document.querySelectorAll<HTMLInputElement>('input')].some(input=>input.value===affiliate));
  await act(async()=>button('Continuar').click());
  await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved?.affiliateUrl,affiliate);assert.equal(saved?.originalUrl,plain);assert.equal(saved?.image,product.image);assert.equal(saved?.operation,'tenis');
  assert.ok(calls.every(p=>!p.includes('/automation')));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
