import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import ProductForm from '../src/components/product-form';
import MercadoLivreAffiliate from '../src/components/mercado-livre-affiliate';
import {importMercadoLivreData} from '../src/server/mercado-livre/import-core';
import {emptyProduct} from '../src/lib/product-draft';
import type {Product} from '../src/lib/domain';
import type {api} from '../src/lib/api';
const plain='https://produto.mercadolivre.com.br/MLB-3574638387-capa-_JM';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=celulares'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}return {dom,root:createRoot(document.getElementById('root')!),close(){dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}};}
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
test('Mercado Livre import does not promote an ordinary URL to affiliate and saves a pending draft',async()=>{
 const {root,dom,close}=fixture(),calls:any[]=[];let saved:Product|undefined;
 const result=await importMercadoLivreData({inputUrl:plain,resolvedUrl:plain,operation:'celulares'},async(path,resource)=>({data:resource==='item'?{id:'MLB3574638387',title:'Capa de celular',currency_id:'BRL',price:49.9}:null,check:{resource,state:resource==='item'?'available':'denied',httpStatus:resource==='item'?200:403}}));
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(path.includes('/operations'))return {operations:[]};assert.equal(path,'/api/products/resolve');assert.equal(body.url,plain);return result;}) as typeof api;
 try{
  await act(async()=>root.render(createElement(ProductForm,{product:{...emptyProduct(),operation:'celulares',originalUrl:plain},request,onClose(){},onSave:async p=>{saved=p;}})));
  assert.equal(calls.length,1);await act(async()=>button('Importar produto').click());
  assert.match(document.body.textContent!,/Link afiliado pendente/);assert.equal(document.querySelector<HTMLInputElement>('input[placeholder="https://meli.la/…"]')!.value,'');
  assert.equal(document.querySelector<HTMLAnchorElement>('a[href*="afiliados/linkbuilder"]')!.target,'_blank');
  await act(async()=>button('Continuar').click());await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved?.affiliateUrl,'');assert.equal(saved?.price,49.9);assert.equal(saved?.originalUrl,plain);assert.equal(saved?.operation,'celulares');assert.equal(saved?.mercadoLivreImport?.affiliateState,'pending');
  assert.ok(calls.every(c=>!c.path.includes('telegram')&&!c.path.includes('/ai/')));
 }finally{await act(async()=>root.unmount());close();}
});
test('existing product response offers the existing record without replacing edited fields or saving duplicates',async()=>{
 const {root,close}=fixture(),id=crypto.randomUUID();let saves=0;
 const request=(async(path:string)=>path.includes('/operations')?{operations:[]}:{existingProductId:id,message:'Anúncio já cadastrado',product:{...emptyProduct(),id,name:'Edição existente'},checks:[],missing:[]}) as typeof api;
 try{await act(async()=>root.render(createElement(ProductForm,{product:{...emptyProduct(),operation:'celulares',originalUrl:plain},request,onSave:async()=>{saves++;},onClose(){}})));await act(async()=>button('Importar produto').click());
  assert.equal(document.querySelector<HTMLAnchorElement>('a[href*="/ofertas/'+id+'"]')!.search,'?brand=celulares');assert.equal(saves,0);
 }finally{await act(async()=>root.unmount());close();}
});
test('affiliate use requires explicit origin confirmation and records informed rather than commission verified',async()=>{
 const {root,close}=fixture(),changes:Partial<Product>[]=[],requests:any[]=[];
 const product=(await importMercadoLivreData({inputUrl:plain,resolvedUrl:plain,operation:'celulares'},async(path,resource)=>({data:null,check:{resource,state:'denied'}}))).product;
 product.affiliateUrl='https://meli.la/manual-fixture?tracking=original%2Fz';
 const request=(async(path:string,method:string,body:any)=>{requests.push({path,method,body});return {url:body.url,message:'Comissão apurada pelo Mercado Livre.'};}) as typeof api;
 try{await act(async()=>root.render(createElement(MercadoLivreAffiliate,{product,request,onChange:p=>changes.push(p)})));
  assert.equal(button('Usar este link de afiliado').disabled,true);assert.equal(requests.length,0);
  await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await act(async()=>button('Usar este link de afiliado').click());
  assert.equal(changes[0].affiliateUrl,product.affiliateUrl);assert.equal(changes[0].mercadoLivreImport?.affiliateState,'informed');assert.equal(requests[0].body.confirmed,true);assert.equal(changes[0].mercadoLivreImport?.affiliateConfirmed,true);
 }finally{await act(async()=>root.unmount());close();}
});
