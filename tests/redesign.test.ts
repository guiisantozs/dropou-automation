import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {PGlite} from '@electric-sql/pglite';
import {parseScreenshot} from '../src/lib/ocr';
import {categoryIcon,parseInstallments,safeInstallments,shortProductName} from '../src/lib/commerce';
import {caption,productKey,Product,publicationError} from '../src/lib/domain';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import {captionError} from '../src/lib/caption-editor';
import {webpDimensions} from '../src/lib/thumbnail';
import {visualAvailability} from '../src/server/ai/availability';
import {checkModel} from '../src/server/ai/model-check';
import CaptionContent from '../src/components/caption-content';
import ProductCatalog from '../src/components/product-catalog';
import OfferPreview from '../src/components/offer-preview';
import ProductForm from '../src/components/product-form';
import {WorkspaceSkeleton} from '../src/components/dashboard-overview';
import type {Offer} from '../src/lib/offers';
import type {api} from '../src/lib/api';
const product=():Product=>({...emptyProduct(),name:'Processador AMD Ryzen 3 3200G Quad Core Radeon Vega 8 AM4',niche:'Hardware',price:447.05,affiliateUrl:'https://meli.la/original?tracking=preservado',checkedAt:new Date().toISOString(),inStock:true,status:'pronto',features:['Gráficos integrados Radeon Vega'],featuresVerified:true,creativeHeadline:'🔥🖥️ UM UPGRADE PARA O SEU PC!'});
const migration=readFileSync('supabase/migrations/20261106132921_offer_editor_and_thumbnails.sql','utf8');

test('OCR rejects marketplace navigation as a title and omits the exact noisy installment regression',()=>{
 const text='Conferir mais produtos da marca AMD\nProcessador AMD Ryzen 3 3200G Quad Core Radeon Vega 8\nR$ 447,05\n5 MV 8x R$ 55,88 sem juros\nProdutos relacionados\nMonitor R$ 199,00';
 const data=parseScreenshot(text,94);assert.match(data.name,/Processador AMD/);assert.equal(data.price,447.05);assert.equal(data.shortName,'Processador AMD Ryzen 3 3200G');assert.equal(data.installments,'');assert.ok(data.uncertain.includes('parcelamento'));
 assert.equal(parseScreenshot('Conferir mais produtos da marca AMD\nR$ 447,05',94).name,'');
 assert.equal(safeInstallments('5 MV 8x R$ 55,88 sem juros'),'');assert.equal(safeInstallments('8x R$ 55,88 sem juros'),'8x de R$ 55,88 sem juros');
 for(const value of ['1x R$ 55,88','99x R$ 55,88','8x R$ 0,00','8x R$ 55,88 ou 10x R$ 44,70'])assert.equal(parseInstallments(value),null);
 assert.deepEqual(parseInstallments('8x de R$ 55,88 sem juros'),{count:8,amount:55.88,interestFree:true});
 const p={...product(),installments:'5 MV 8x R$ 55,88 sem juros',installmentsVerified:true};assert.ok(!caption(p).includes('5 MV'));assert.ok(!formatCaption(p).includes('55,88'));
});

test('caption editing preserves the original link, disclosure and verified commercial values',()=>{
 const p=product(),text=formatCaption(p,'dropou',p.creativeHeadline);
 assert.equal(captionError(text,p),null);assert.match(text,/UM UPGRADE/);assert.match(text,/Processador AMD Ryzen 3 3200G[^*]*\*/);
 assert.equal(captionError(text.replace('UM UPGRADE','SEU NOVO UPGRADE')+'\n\n💙 Bora conferir!',p),null);
 assert.match(captionError(text.replace('#publi',''),p)!,/#publi/);assert.match(captionError(text.replace('?tracking=preservado','?tracking=alterado'),p)!,/original/);
 assert.match(captionError(text+'\nR$ 99,00',p)!,/valor diferente/);assert.match(captionError(text+'\n90% de desconto',p)!,/desconto/);assert.match(captionError(text+'\n💳 8x de R$ 55,88 sem juros',p)!,/valor diferente|parcelamento/);
 assert.equal(shortProductName(p.name),'Processador AMD Ryzen 3 3200G');
});

test('formatted previews display bold, strike, line breaks, emoji and safe clickable original URLs',()=>{
 const text='🔥 *OFERTA* #publi\n~R$ 499,00~\nhttps://meli.la/test?x=original\n<img src=x onerror=alert(1)>';
 for(const channel of ['whatsapp','telegram'] as const){const html=renderToStaticMarkup(createElement(CaptionContent,{text,channel}));assert.match(html,/<strong>OFERTA<\/strong>/);assert.match(html,/<del>R\$ 499,00<\/del>/);assert.match(html,/href="https:\/\/meli.la\/test\?x=original"/);assert.ok(html.includes('\n'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('*OFERTA*'));}
});

test('configuration diagnosis detects disabled budget, flags, limits and cooldown without provider calls',()=>{
 const env={OPENAI_API_KEY:'mock',OPENAI_ENABLED:'true',OPENAI_VISION_ENABLED:'true',SUPABASE_SECRET_KEY:'mock'},usage={budget:{enabled:false,total_limit:4.5,daily_limit:.5,daily_requests:100,not_before:null as string|null},days:[] as {day:string;calls:number;cost:number;reserved:number}[]};
 assert.match(visualAvailability(env,usage,.00557).reason,/Consumo de IA/);usage.budget.enabled=true;assert.equal(visualAvailability(env,usage,.00557).enabled,true);
 assert.equal(visualAvailability({...env,OPENAI_VISION_ENABLED:'false'},usage,.00557).enabled,false);usage.budget.daily_limit=.001;assert.equal(visualAvailability(env,usage,.00557).enabled,false);usage.budget.daily_limit=.5;usage.budget.not_before=new Date(Date.now()+60000).toISOString();assert.equal(visualAvailability(env,usage,.00557).enabled,false);
});

test('model access check only retrieves metadata, never generates or reflects credentials',async()=>{
 let calls=0;const http:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models/gpt-6-luna');assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);return Response.json({id:'gpt-6-luna'});};
 assert.equal((await checkModel('gpt-6-luna',undefined,http)).available,false);assert.equal(calls,0);assert.equal((await checkModel('gpt-6-luna','mock-key',http)).available,true);assert.equal(calls,1);
 for(const status of [401,403,404,429,500]){const result=await checkModel('gpt-6-luna','mock-key',async()=>Response.json({error:{message:'mock-key must not be reflected'}},{status}));assert.equal(result.available,false);assert.ok(!result.message.includes('mock-key'));}
});

test('catalog uses authorized photos, distinct category icons and safe thumbnail dimensions',()=>{
 for(const [name,icon] of [['Ryzen 3 3200G','cpu'],['Controle GameSir','controller'],['Monitor OLED','monitor'],['Headset','headset'],['Furadeira','tool'],['Teclado','keyboard'],['Jogo PS5','game']])assert.equal(categoryIcon({name,niche:'Produtos'}),icon);
 const p={...product(),image:'https://example.com/exact-product.webp'},html=renderToStaticMarkup(createElement(ProductCatalog,{products:[p],onCreate(){},onOpen(){},onPreview(){},onImport(){}}));assert.match(html,/src="https:\/\/example.com\/exact-product.webp"/);assert.match(html,/Visualização em cards/);assert.match(html,/Processador AMD Ryzen 3 3200G/);assert.ok(!html.includes('<table'));
 const bytes=new Uint8Array(30);bytes.set(Buffer.from('RIFF'),0);bytes.set(Buffer.from('WEBPVP8X'),8);bytes[24]=255;bytes[27]=255;assert.deepEqual(webpDimensions(bytes),{width:256,height:256});bytes[20]=2;assert.throws(()=>webpDimensions(bytes),/animadas/);assert.throws(()=>webpDimensions(new Uint8Array(30)),/inválida/);
});

test('loading state is announced and layout has responsive breakpoints and reduced-motion support',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceSkeleton));assert.match(html,/role="status"/);assert.match(html,/Carregando/);
 const css=readFileSync('src/app/workspace.css','utf8');assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/max-width:720px/);assert.match(css,/max-width:1000px/);assert.match(css,/max-width:1240px/);assert.match(css,/:focus-visible/);
});

test('manual caption and original persist transactionally under owner RLS; expiry still blocks publication',async()=>{
 const db=new PGlite(),a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create table auth.users(id uuid primary key);create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);insert into storage.buckets values('offer-images',false,array['image/jpeg']);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
  await db.exec(readFileSync('supabase/schema.sql','utf8'));await db.exec(readFileSync('supabase/whatsapp-flow.sql','utf8'));await db.exec(migration);await db.exec(migration);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec('set role authenticated');
  const p=product(),saved=(await db.query<{p:Product}>('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).rows[0].p,original=formatCaption(saved,'dropou',p.creativeHeadline);
  let o=(await db.query<{o:Offer}>('select dropou_save_offer_version($1,$2,$3,$4,false) o',[saved.id,JSON.stringify(saved),original,original])).rows[0].o;
  const edited=original.replace('UM UPGRADE','DÊ UM UPGRADE')+'\n\n💙 Minha seleção de hoje';
  o=(await db.query<{o:Offer}>('select dropou_save_offer_version($1,$2,$3,$4,true) o',[saved.id,JSON.stringify(o.snapshot),edited,'Should not replace original'])).rows[0].o;
  assert.equal(o.caption,edited);assert.equal(o.original_caption,original);assert.equal(o.manually_edited,true);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);await db.exec('set role authenticated');assert.equal((await db.query('select * from offers')).rows.length,0);await assert.rejects(db.query('select dropou_save_offer_version($1,$2,$3,$4,true)',[saved.id,JSON.stringify(o.snapshot),edited,original]),/não encontrado/i);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec('set role authenticated');const expired={...o.snapshot,checkedAt:new Date(Date.now()-16*60000).toISOString()};await db.query('select dropou_save_product($1,$2)',[JSON.stringify(expired),productKey(expired)]);const latest=(await db.query<{data:Product}>('select data from products where id=$1',[p.id])).rows[0].data;
  o=(await db.query<{o:Offer}>('select dropou_save_offer_version($1,$2,$3,$4,true) o',[p.id,JSON.stringify(latest),edited,original])).rows[0].o;assert.equal(o.caption,edited);assert.equal(o.status,'rascunho');assert.ok(publicationError(o.snapshot));await assert.rejects(db.query('select dropou_publish_offer($1)',[o.id]),/bloqueada/i);
 }finally{await db.close();}
});

test('editor preserves confirmed historical manual copy on mount, saves without AI, restores original and returns keyboard focus',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<button id="opener">Abrir</button><div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const p={...product(),checkedAt:new Date(Date.now()-16*60000).toISOString()},original=formatCaption(p,'dropou',p.creativeHeadline),edited=original+'\n\n💙 Minha edição',container=dom.window.document.getElementById('root')! as HTMLDivElement,root=createRoot(container);let current:Offer={id:crypto.randomUUID(),product_id:p.id,caption:edited,original_caption:original,manually_edited:true,snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt},calls=0,closed=0;
 const request=(async(path:string,method:string,body:{caption:string;originalCaption:string})=>{calls++;assert.equal(path,'/api/offers');assert.equal(method,'POST');current={...current,caption:body.caption};return {offer:current};}) as typeof api;
 const buttons=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(b=>b.textContent?.includes(text));
 try{
  dom.window.document.getElementById('opener')!.focus();await act(async()=>root.render(createElement(OfferPreview,{product:p,offer:current,request,onRefresh:async()=>{},onClose:()=>{closed++;},onEdit(){}})));
  assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);assert.equal((buttons('Copiar para WhatsApp')[0]).disabled,false);assert.equal(calls,0);
  await act(async()=>buttons('Editar legenda')[0].click());assert.equal(container.querySelector('textarea')?.value,edited);await act(async()=>buttons('Salvar edição')[0].click());assert.equal(current.caption,edited);assert.equal(calls,1);
  await act(async()=>root.render(createElement(OfferPreview,{key:'reopened',product:p,offer:current,request,onRefresh:async()=>{},onClose:()=>{closed++;},onEdit(){}})));assert.match(container.querySelector('.message-preview')!.textContent!,/R\$/);
  await act(async()=>buttons('Editar legenda')[0].click());assert.equal(container.querySelector('textarea')?.value,edited);await act(async()=>buttons('Restaurar versão original')[0].click());assert.equal(container.querySelector('textarea')?.value,original);await act(async()=>buttons('Salvar edição')[0].click());assert.equal(current.caption,original);assert.equal(calls,2);
  await act(async()=>dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closed,1);
 }finally{await act(async()=>root.unmount());assert.equal(dom.window.document.activeElement?.id,'opener');dom.window.close();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as Record<string,unknown>)[key];}}
});

test('catalog switches list/cards and the three-step form keeps its inputs between steps without AI',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const container=dom.window.document.getElementById('root')! as HTMLDivElement,root=createRoot(container),p=product();let saves=0;const click=async(text:string)=>act(async()=>{const button=Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===text||b.getAttribute('aria-label')===text);assert.ok(button,'Button '+text);button.click();});
 try{
  await act(async()=>root.render(createElement(ProductCatalog,{products:[p],onCreate(){},onOpen(){},onPreview(){},onImport(){}})));assert.ok(container.querySelector('.product-collection.cards'));await click('Visualização em lista');assert.ok(container.querySelector('.product-collection.list'));await click('Visualização em cards');assert.ok(container.querySelector('.product-collection.cards'));
  await act(async()=>root.render(createElement(ProductForm,{product:p,onClose(){},onSave:async next=>{saves++;assert.equal(next.affiliateUrl,p.affiliateUrl);assert.equal(next.checkedAt,null);}})));assert.match(container.querySelector('[aria-current=step]')!.textContent!,/Oferta/);
  await click('Etapa 1: Produto');assert.match(container.querySelector('[aria-current=step]')!.textContent!,/Produto/);await click('Continuar');assert.match(container.querySelector('[aria-current=step]')!.textContent!,/Oferta/);await click('Continuar');assert.match(container.querySelector('[aria-current=step]')!.textContent!,/Publicação/);
  await click('Voltar');const inputs=Array.from(container.querySelectorAll<HTMLInputElement>('input'));assert.ok(inputs.some(input=>input.value===p.name));await click('Continuar');await act(async()=>container.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(saves,1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as Record<string,unknown>)[key];}}
});
