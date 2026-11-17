import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import QuickOfferModal from '../src/components/quick-offer-modal';
import {GeneralProductCard} from '../src/components/general-dashboard';
import {CatalogProductRow} from '../src/components/catalog-parts';
import ShopeeSavedProducts from '../src/components/shopee-saved-products';
import {operationSchema,isShopeeOperation} from '../src/lib/workspace-brands';
import {emptyProduct} from '../src/lib/product-draft';
import {pricedDraftCaption} from '../src/lib/publication-copy';
import {beginQuickOfferRead,type QuickOfferData} from '../src/lib/quick-publication';
import type {api} from '../src/lib/api';
import type {CatalogRow} from '../src/lib/catalog';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
function fixture(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 }
 dom.window.confirm=()=>{throw Error('No generic confirmation belongs in the publication action');};
 return {root:createRoot(document.getElementById('root')!),container:document.getElementById('root')!,async close(){dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};
}
function model(operation:typeof operationSchema.options[number]):QuickOfferData{
 const product={...emptyProduct(),operation,name:'Produto fixture',price:149.9,inStock:true,checkedAt:new Date().toISOString(),affiliateUrl:'https://meli.la/fixture',status:'pronto' as const};
 return {product,offer:{id:crypto.randomUUID(),product_id:product.id,snapshot:product,caption:pricedDraftCaption(product),status:'pronto',created_at:product.createdAt,updated_at:product.createdAt},serverNow:new Date().toISOString()};
}

test('Agendar itself reviews the visible imported snapshot in every operation, without another confirmation',async t=>{
 for(const brand of operationSchema.options)await t.test(brand,async()=>{
  const f=fixture(),d=model(brand),writes:{path:string;body:any}[]=[];d.product.inStock=null;d.product.checkedAt=null;d.preparationNeedsReview=true;
  const approved={...d.product,inStock:true,checkedAt:new Date().toISOString()},reviewed={...d.offer!,snapshot:approved};
  const request=(async(path:string,method='GET',body?:any)=>{
   if(method==='POST')writes.push({path,body});
   if(path==='/api/publication-config')return {enabled:true,slots:['09:00'],telegram:{available:true,title:'Canal fixture',key:'a'.repeat(64)}};
   if(path.endsWith('/offer'))return d;
   if(path==='/api/offers'){assert.equal(body.review,true);assert.deepEqual(body.expected,d.product);assert.equal(body.caption,d.offer!.caption);return {offer:reviewed,serverNow:approved.checkedAt};}
   if(path.endsWith('/schedule')){assert.equal(body.confirmed,true);assert.equal(body.allowSafe,false);assert.equal(body.caption,reviewed.caption);assert.equal(body.mode,'verified');return {saved:true};}
   throw Error('Unexpected request '+path);
  }) as typeof api;
  try{await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:d.product.id,operation:brand,intent:'schedule'},request,attempts:new Set<string>(),onClose(){}})));
   assert.equal(f.container.querySelector('#quick-offer-title')?.textContent,'Agendar oferta');assert.ok(!f.container.textContent?.includes('Conferi os dados exibidos'));
   const button=[...f.container.querySelectorAll<HTMLButtonElement>('.quick-offer-actions button')].find(b=>b.textContent==='Agendar')!;assert.equal(button.disabled,false);assert.equal(writes.length,0);
   await act(async()=>button.click());assert.deepEqual(writes.map(c=>c.path),['/api/offers','/api/offers/'+reviewed.id+'/schedule']);
   assert.ok(!writes.some(c=>/telegram$|publish$|automation|reconfirm|\/ai\//.test(c.path)));
  }finally{await act(async()=>f.root.unmount());await f.close();}
 });
});

test('Conferir is visible outside menus in dashboard and catalog cards of every operation',()=>{
 for(const brand of operationSchema.options){const d=model(brand),row={id:d.product.id,brand_id:brand,kind:'product',data:d.product,destinations:[],entered_at:d.product.createdAt,expires_at:new Date(Date.now()+86400000).toISOString(),pinned:false} as unknown as CatalogRow;
  const html=renderToStaticMarkup(createElement('div',null,createElement(GeneralProductCard,{product:d.product,onMessage(){}}),createElement(CatalogProductRow,{row,now:Date.now(),busy:false,onOpen(){},onRepost(){},onPin(){},onHistory(){},onRemove(){}}))),dom=new JSDOM(html);
  try{const actions=[...dom.window.document.querySelectorAll('a,button')].filter((b:any)=>b.textContent.trim()==='Conferir');assert.equal(actions.length,2,brand);for(const b of actions)assert.equal((b as Element).closest('details'),null,brand);}finally{dom.window.close();}
 }
});

test('each operation saves, schedules and publishes directly in the premium modal using existing services',async t=>{
 for(const brand of operationSchema.options)for(const action of ['Salvar','Agendar','Publicar agora'] as const)await t.test(brand+' / '+action,async()=>{
  const f=fixture(),d=model(brand),calls:{path:string;method:string;body:any}[]=[],config={enabled:true,slots:['09:00','20:30'],serverNow:d.serverNow,telegram:{available:true,id:'-100fixture',title:'Canal fixture '+brand,key:'a'.repeat(64)}};let value=d;
  const request=(async(path:string,method='GET',body?:any)=>{calls.push({path,method,body});if(path==='/api/publication-config')return config;if(path.endsWith('/offer'))return value;if(path==='/api/offers'){assert.equal(body.review,true);assert.deepEqual(body.expected,d.product);return {offer:d.offer,serverNow:d.serverNow};}if(path.endsWith('/schedule')){assert.equal(body.confirmed,true);assert.equal(body.allowSafe,false);assert.ok(Date.parse(body.scheduledAt)>Date.now());value={...d,jobs:[{id:'job',channel:'telegram',state:'queued',scheduled_at:body.scheduledAt,destination_title:config.telegram.title,attempts:0,message_ids:[]}]};return {job:{state:'queued'}};}if(path.endsWith('/telegram')){assert.equal(body.confirmed,true);assert.equal(body.targetKey,config.telegram.key);value={...d,delivery:{state:'sent',message_ids:['fixture'],destination_title:config.telegram.title}};return {sent:true};}throw Error('Unexpected request '+path);}) as typeof api;
  try{
   await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:d.product.id,operation:brand,product:d.product},request,attempts:new Set<string>(),onClose(){}})));
   assert.equal(f.container.querySelector('#quick-offer-title')?.textContent,'Publicar oferta');assert.equal(f.container.querySelector('.product-form'),null);
   assert.ok(![...f.container.querySelectorAll('button')].some(b=>/^(Continuar|Próximo)$/.test(b.textContent||'')));
   const button=[...f.container.querySelectorAll<HTMLButtonElement>('.quick-offer-actions button')].find(b=>b.textContent?.trim()===action)!;assert.ok(button);assert.equal(button.disabled,false);
   await act(async()=>button.click());
   const writes=calls.filter(c=>c.method==='POST');assert.equal(writes.length,action==='Agendar'?2:1,JSON.stringify(writes));if(action==='Agendar'){assert.equal(writes[0].path,'/api/offers');assert.equal(writes[0].body.review,true);}assert.ok(writes.at(-1)!.path.endsWith(action==='Salvar'?'/api/offers':action==='Agendar'?'/schedule':'/telegram'));
   assert.ok(!calls.some(c=>/reconfirm|\/ai\/|\/automation/.test(c.path)));assert.match(f.container.textContent!,action==='Salvar'?/Oferta salva/:action==='Agendar'?/Agendamento salvo/:/Telegram confirmou/);
  }finally{await act(async()=>f.root.unmount());await f.close();}
 });
});

test('missing token/destination and invalid stock remain visible in the modal and cannot publish',async()=>{
 const f=fixture(),d=model('beleza');d.product.inStock=false;const calls:string[]=[];
 const request=(async(path:string,method='GET')=>{assert.equal(method,'GET');calls.push(path);return path==='/api/publication-config'?{telegram:{available:false,reason:'Token ausente'},slots:[]}:d;}) as typeof api;
 try{await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:d.product.id,operation:'beleza'},request,attempts:new Set<string>(),onClose(){}})));assert.match(f.container.querySelector('.quick-offer-notice')!.textContent!,/preço|disponibilidade|conferência/i);assert.equal([...f.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Publicar agora')!.disabled,true);assert.equal(calls.length,2);await act(async()=>[...f.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Salvar')!.click());assert.match(f.container.querySelector('[role=alert]')!.textContent!,/indisponível/);assert.equal(calls.length,2,'saving must not turn a known out-of-stock product into an available one');}finally{await act(async()=>f.root.unmount());await f.close();}
});

test('saved-link preparation reads the canonical product without opening an editor or trusting another operation',async()=>{
 for(const brand of operationSchema.options.filter(isShopeeOperation)){
  const d=model(brand),calls:string[]=[];const request=(async(path:string,method='GET',body?:any)=>{calls.push(method+' '+path);if(method==='POST'){assert.deepEqual(body,{action:'prepare',id:'saved-id'});return {productId:d.product.id,needsReview:true};}return path.includes('/products/')?d:{telegram:{available:false}};}) as typeof api;
  const reads=beginQuickOfferRead(request,'saved-id',brand,'saved');assert.equal((await reads.model).product.id,d.product.id);await reads.destinations;
  assert.equal(calls.filter(c=>c.startsWith('POST')).length,1);assert.ok(!calls.some(c=>/reconfirm|telegram$|schedule$/.test(c)));
  const wrong=(async(path:string,method='GET')=>method==='POST'?{productId:'expected'}:path.includes('/products/')?d:{telegram:{available:false}}) as typeof api;
  await assert.rejects(beginQuickOfferRead(wrong,'saved-id',brand,'saved').model,/não pertence/);
 }
});

test('Shopee library exposes Conferir outside the menu, and needsReview never forces the old editor',async()=>{
 const f=fixture(),opened:unknown[][]=[],row={id:crypto.randomUUID(),input_url:'https://shopee.com.br/product/1/2',canonical_url:'https://shopee.com.br/product/1/2',state:'ready' as const,error:null,prepared_product_id:null,data:{itemId:'2',shopId:'1',name:'Fixture importado',price:149.9,priceMax:199.9,image:'',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/1/2',rating:null,sales:null,commission:.1,reportedDiscount:null,checkedAt:new Date().toISOString()},created_at:new Date().toISOString(),updated_at:new Date().toISOString()},data={products:[row],total:1,more:false,credentialsReady:true,budget:{used:0,limit:8,globalUsed:0,globalLimit:10}};
 const request=(async(_path:string,method='GET')=>method==='POST'?{productId:'canonical-product',needsReview:true}:data) as typeof api;
 try{await act(async()=>f.root.render(createElement(ShopeeSavedProducts,{operation:'beleza',initialData:data,request,onOpen:(...args)=>{opened.push(args);}})));const button=f.container.querySelector<HTMLButtonElement>('.library-check-button')!;assert.equal(button.closest('details'),null);assert.equal(button.textContent,'Conferir');await act(async()=>button.click());assert.deepEqual(opened,[['canonical-product','preview']]);}finally{await act(async()=>f.root.unmount());await f.close();}
});

test('an unprepared saved card opens immediately, reviews in place and always publishes the canonical product',async()=>{
 const f=fixture(),d=model('casa'),writes:{path:string;body:any}[]=[],attempts=new Set<string>();let release!:(value:any)=>void;
 const request=(async(path:string,method='GET',body?:any)=>{
  if(method==='POST')writes.push({path,body});
  if(path==='/api/shopee/saved-products')return new Promise(resolve=>{release=resolve;});
  if(path==='/api/publication-config')return {slots:['09:00'],telegram:{available:true,id:'-100fixture',title:'Canal fixture',key:'a'.repeat(64)}};
  if(path==='/api/products/'+d.product.id+'/offer')return d;
  if(path==='/api/offers'){assert.equal(body.productId,d.product.id);assert.equal(body.review,true);return {offer:d.offer};}
  if(path==='/api/offers/'+d.offer!.id+'/telegram')return {sent:true};
  throw Error('Unexpected '+path);
 }) as typeof api;
 try{
  await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:'saved-id',source:'saved',operation:'casa',preview:{name:'Produto do card',image:'',price:149.9,niche:'Casa',store:'Shopee'}},request,attempts,onClose(){}})));
  assert.match(f.container.textContent!,/Produto do card/);assert.equal(f.container.querySelector('#quick-offer-title')?.textContent,'Publicar oferta');
  await act(async()=>release({productId:d.product.id,needsReview:true}));
  const button=(name:string)=>[...f.container.querySelectorAll<HTMLButtonElement>('.quick-offer-actions button')].find(b=>b.textContent===name)!;
  assert.equal(button('Publicar agora').disabled,true);assert.match(f.container.querySelector('.quick-offer-notice')!.textContent!,/variação/);
  await act(async()=>button('Salvar').click());assert.equal(button('Publicar agora').disabled,false);
  await act(async()=>button('Publicar agora').click());assert.ok(attempts.has('casa:'+d.product.id+':telegram:initial'));assert.equal(writes.filter(w=>w.path==='/api/shopee/saved-products').length,1);assert.equal(writes.filter(w=>w.path.endsWith('/telegram')).length,1);
 }finally{await act(async()=>f.root.unmount());await f.close();}
});

test('new and edited valid offers are saved by the publication action without a separate save step',async t=>{
 for(const brand of operationSchema.options)await t.test(brand,async()=>{
  const f=fixture(),d=model(brand),writes:string[]=[];let value={...d,offer:null} as QuickOfferData;
  const request=(async(path:string,method='GET',body?:any)=>{
   if(method==='POST')writes.push(path);
   if(path==='/api/publication-config')return {slots:['09:00'],telegram:{available:true,id:'-100fixture',title:'Canal fixture',key:'a'.repeat(64)}};
   if(path.endsWith('/offer'))return value;
   if(path==='/api/offers'){assert.equal(body.review,false);assert.deepEqual(body.expected,d.product);value={...d,offer:{...d.offer!,caption:body.caption}};return {offer:value.offer};}
   if(path.endsWith('/telegram'))return {sent:true};throw Error('Unexpected '+path);
  }) as typeof api;
  try{await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:d.product.id,operation:brand},request,attempts:new Set<string>(),onClose(){}})));const button=[...f.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Publicar agora')!;assert.equal(button.disabled,false);await act(async()=>button.click());assert.deepEqual(writes,['/api/offers','/api/offers/'+d.offer!.id+'/telegram']);}finally{await act(async()=>f.root.unmount());await f.close();}
 });
});

test('an unconfigured Telegram destination reports its actual pending configuration inside the modal',async()=>{
 const f=fixture(),d=model('natal');const request=(async(path:string,method='GET')=>{assert.equal(method,'GET');return path==='/api/publication-config'?{telegram:{available:false,reason:'Configure o canal desta marca em Configurações.'},slots:[]}:d;}) as typeof api;
 try{await act(async()=>f.root.render(createElement(QuickOfferModal,{target:{id:d.product.id,operation:'natal'},request,attempts:new Set<string>(),onClose(){}})));assert.match(f.container.querySelector('.quick-offer-notice')!.textContent!,/Configure o canal/);assert.equal([...f.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Publicar agora')!.disabled,true);assert.equal(f.container.querySelector('.quick-offer-editor'),null);}finally{await act(async()=>f.root.unmount());await f.close();}
});
