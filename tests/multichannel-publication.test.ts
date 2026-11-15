import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import MultichannelPublication from '../src/components/multichannel-publication';
import {emptyProduct} from '../src/lib/product-draft';
import {resolveTelegramTarget} from '../src/server/telegram-core';
import type {api} from '../src/lib/api';
import type {Offer} from '../src/lib/offers';
const product={...emptyProduct(),operation:'dropou' as const,name:'Fone Bluetooth',price:129.9,checkedAt:new Date().toISOString(),inStock:true,affiliateUrl:'https://shopee.com.br/product/123/456'};
const offer:Offer={id:crypto.randomUUID(),product_id:product.id,caption:'Fone Bluetooth #publi\n'+product.affiliateUrl,snapshot:product,status:'pronto',created_at:product.createdAt,updated_at:product.createdAt};
const options=[{brand:'dropou',name:'Tech & Games',title:'Canal Tech & Games',key:'a'.repeat(64),available:true,enabled:true},{brand:'celulares',name:'Celulares & Gadgets',title:'Canal Celulares & Gadgets',key:'b'.repeat(64),available:true,enabled:false},{brand:'tenis',name:'Tênis',title:'Não configurado',available:false,reason:'Configure o destino'}];
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,v]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}return {root:createRoot(dom.window.document.getElementById('root')!),close(){dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}};}
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
test('multi-channel selection requires explicit confirmation and reports partial outcomes per destination',async()=>{
 const {root,close}=fixture(),calls:any[]=[];let refreshed=0;
 const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});return method==='GET'?{options}:{outcomes:[{brand:'dropou',state:'sent'},{brand:'celulares',state:'uncertain'}]};}) as typeof api;
 try{await act(async()=>root.render(createElement(MultichannelPublication,{product,offer,text:offer.caption,presentation:{mediaMode:'text',photoConfirmed:false},disabled:false,request,onUpdate:async()=>{refreshed++;}})));
  assert.equal(calls.length,0);await act(async()=>button('Publicar em canais').click());assert.equal(calls.length,1);
  const checks=()=>[...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];assert.equal(checks()[0].checked,true);assert.equal(checks()[2].disabled,true);assert.equal(button('Confirmar envio nos canais').disabled,true);
  await act(async()=>checks()[1].click());assert.equal(calls.length,1);await act(async()=>checks().at(-1)!.click());await act(async()=>button('Confirmar envio nos canais').click());
  assert.deepEqual(calls[1].body.targets.map((t:any)=>t.brand),['dropou','celulares']);assert.equal(calls[1].body.caption,offer.caption);assert.equal(calls[1].body.confirmed,true);assert.equal(refreshed,1);assert.match(document.body.textContent!,/entrega incerta; não repita/);assert.match(document.body.textContent!,/publicado e confirmado/);
 }finally{await act(async()=>root.unmount());close();}
});
test('a lost response keeps the authorization immutable and only consults that request on an explicit second click',async()=>{
 const {root,close}=fixture(),posts:any[]=[];
 const request=(async(_path:string,method='GET',body?:any)=>{if(method==='GET')return {options};posts.push(body);if(posts.length===1)throw new Error('Resposta perdida');return {alreadyReserved:true,outcomes:[{brand:'dropou',state:'sent'}]};}) as typeof api;
 try{await act(async()=>root.render(createElement(MultichannelPublication,{product,offer,text:offer.caption,presentation:{mediaMode:'text',photoConfirmed:false},disabled:false,request,onUpdate:async()=>{}})));await act(async()=>button('Publicar em canais').click());await act(async()=>[...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].at(-1)!.click());await act(async()=>button('Confirmar envio nos canais').click());assert.equal(posts.length,1);assert.ok(document.querySelector<HTMLInputElement>('input[type=checkbox]')!.matches(':disabled'));await act(async()=>button('Consultar solicitação').click());assert.deepEqual(posts[1],posts[0]);
 }finally{await act(async()=>root.unmount());close();}
});
test('channel verification checks the expected bot username and publishing permission without sending messages',async()=>{
 const calls:string[]=[],env={TELEGRAM_BOT_TOKEN:'fixture-no-real-token',TELEGRAM_CHAT_ID:'@dropoucelulares',TELEGRAM_EXPECTED_BOT_USERNAME:'celularegadgetbot'};
 const http=(async(url:string)=>{const method=String(url).split('/').at(-1)!;calls.push(method);return Response.json({ok:true,result:method==='getMe'?{id:12,username:'celularegadgetbot'}:method==='getChat'?{id:-1005678,type:'channel',title:'Celulares & Gadgets'}:{status:'administrator',can_post_messages:true}});}) as typeof fetch;
 const target=await resolveTelegramTarget(env,http);assert.equal(target.id,'-1005678');assert.deepEqual(new Set(calls),new Set(['getMe','getChat','getChatMember']));
 await assert.rejects(resolveTelegramTarget({...env,TELEGRAM_EXPECTED_BOT_USERNAME:'otherbot'},http),/bot esperado/);
 await assert.rejects(resolveTelegramTarget(env,(async(url:string)=>String(url).endsWith('getChatMember')?Response.json({ok:true,result:{status:'member'}}):http(url)) as typeof fetch),/administrador/);
});
