import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import PublicationActions from '../src/components/publication-actions';
import DeleteProduct from '../src/components/delete-product';
import ChannelFunnels from '../src/components/channel-funnels';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import type {Offer} from '../src/lib/offers';
import type {PublicationContext} from '../src/lib/publication';
import type {api} from '../src/lib/api';
import {renderToStaticMarkup} from 'react-dom/server';
import DashboardOverview from '../src/components/dashboard-overview';
import ProductCatalog from '../src/components/product-catalog';
import PublicationSchedule from '../src/components/publication-schedule';
import PublicationHistory,{PublicationHistoryRow} from '../src/components/publication-history';
import type {PublicationHistoryEntry} from '../src/lib/publication-history';
function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}return {dom,container:document.getElementById('root')!,close(){dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}
const product=()=>({...emptyProduct(),name:'Controle de teste',affiliateUrl:'https://meli.la/teste',price:160.34,checkedAt:new Date().toISOString(),inStock:true,status:'pronto' as const});
const unpublished={published:false,publishedAt:null,state:null,scheduledAt:null};
function historyEntry(channel:'telegram'|'whatsapp'='telegram'):PublicationHistoryEntry{return {id:crypto.randomUUID(),product_id:crypto.randomUUID(),product_name:'Produto do histórico',channel,status:channel==='telegram'?'sent':'manual_confirmed',occurred_at:'2026-11-06T19:23:00Z',recorded_at:'2026-11-06T19:23:01Z',scheduled_at:'2026-11-06T19:00:00Z',destination:'Canal salvo',destination_id:'-100123',message_ids:channel==='telegram'?['14']:[],confirmed_by:channel==='whatsapp'?'actor':null,confirmed_by_name:channel==='whatsapp'?'admin@example.test':null,is_republication:false,publication_round:crypto.randomUUID(),error:null,review_required:false,message_links:channel==='telegram'?[{id:'14',url:'https://t.me/c/123/14'}]:[]};}
function offer(p=product()):Offer{return {id:crypto.randomUUID(),product_id:p.id,caption:formatCaption(p),snapshot:p,status:'pronto',created_at:p.createdAt,updated_at:p.createdAt};}
test('Telegram publication leaves WhatsApp prepare/copy/share available; those actions never record a publication',async()=>{
 const {container,dom,close}=fixture(),root=(await import('react-dom/client')).createRoot(container),p=product(),o=offer(p),calls:{path:string;method:string;body:any}[]=[],copied:string[]=[],shared:string[]=[],delivery={state:'sent',message_ids:['51'],destination_title:'Telegram correto'},context:PublicationContext={delivery};
 Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async(text:string)=>{copied.push(text);}},configurable:true});Object.defineProperty(dom.window.navigator,'share',{value:async(data:{text:string})=>{shared.push(data.text);},configurable:true});
 const request=(async(path:string,method='GET',body:any)=>{calls.push({path,method,body});assert.ok(!path.includes('/ai/'));if(path.endsWith('/publish'))return {publication:{id:'manual',channel:'whatsapp',confirmed_by:'owner',destination:body.destination,published_at:new Date().toISOString()}};if(path.endsWith('/offer'))return {...context,whatsapp:{id:'manual',channel:'whatsapp',confirmed_by:'owner',destination:'Canal WhatsApp teste',published_at:new Date().toISOString()}};throw Error(path);}) as typeof api;
 const button=(label:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
 try{
  await act(async()=>root.render(createElement(PublicationActions,{product:p,offer:o,text:o.caption,context,request,save:async()=>o,onUpdate:async()=>{},onEdit(){}})));
  assert.equal(button('Publicar agora no Telegram').disabled,true);assert.equal(button('Preparar para WhatsApp').disabled,false);
  await act(async()=>button('Preparar para WhatsApp').click());await act(async()=>button('Copiar legenda').click());await act(async()=>button('Compartilhar no WhatsApp').click());assert.deepEqual(copied,[o.caption]);assert.deepEqual(shared,[o.caption]);assert.equal(calls.length,0);
  const input=container.querySelector<HTMLInputElement>('.manual-publication input:not([type=checkbox])')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Canal WhatsApp teste');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>container.querySelector<HTMLInputElement>('.manual-publication input[type=checkbox]')!.click());assert.equal(button('Confirmar publicação manual').disabled,false);await act(async()=>button('Confirmar publicação manual').click());
  assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.ok(calls[0].path.endsWith('/publish'));assert.equal(calls[0].body.confirmed,true);assert.match(container.querySelector('.channel-statuses')!.textContent!,/Telegram:Publicada/);assert.match(container.querySelector('.channel-statuses')!.textContent!,/WhatsApp:Publicada manualmente/);
 }finally{await act(async()=>root.unmount());close();}
});
test('manual WhatsApp publication leaves Telegram available and requires explicit text-only choice when no photo exists',async()=>{
 const {container,close}=fixture(),root=(await import('react-dom/client')).createRoot(container),p=product(),o=offer(p),manual={id:'manual',channel:'whatsapp' as const,confirmed_by:'owner',destination:'Grupo confirmado',published_at:new Date().toISOString()},calls:any[]=[];let sent=false;
 const request=(async(path:string,method='GET',body:any)=>{calls.push({path,method,body});if(path==='/api/publication-config')return {enabled:false,telegram:{available:true,title:'Canal real configurado',id:'-100123',key:'a'.repeat(64)}};if(path.endsWith('/telegram')){sent=true;assert.equal(body.mediaMode,'text');return {sent:true};}if(path.endsWith('/offer'))return {whatsapp:manual,delivery:sent?{state:'sent',message_ids:['91'],destination_title:'Canal real configurado'}:undefined};throw Error(path);}) as typeof api;
 const button=(label:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
 try{
  await act(async()=>root.render(createElement(PublicationActions,{product:p,offer:o,text:o.caption,context:{whatsapp:manual},request,save:async()=>o,onUpdate:async()=>{},onEdit(){}})));
  assert.equal(button('Preparar para WhatsApp').disabled,true);assert.equal(button('Publicar agora no Telegram').disabled,false);await act(async()=>button('Publicar agora no Telegram').click());assert.equal(button('Confirmar envio ao Telegram').disabled,true);assert.match(container.querySelector('[role=dialog]')!.textContent!,/Adicione uma foto/);
  await act(async()=>[...container.querySelectorAll<HTMLLabelElement>('label')].find(l=>l.textContent?.includes('Publicar somente texto'))!.querySelector<HTMLInputElement>('input')!.click());assert.equal(button('Confirmar envio ao Telegram').disabled,false);await act(async()=>button('Confirmar envio ao Telegram').click());assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.match(container.querySelector('.channel-statuses')!.textContent!,/WhatsApp:Publicada manualmente/);
 }finally{await act(async()=>root.unmount());close();}
});
test('catalog deletion confirms archival and requires explicit cancellation of related jobs',async()=>{
 const {container,close}=fixture(),root=(await import('react-dom/client')).createRoot(container),calls:any[]=[],messages:string[]=[],request=(async(_path:string,method='GET',body:any)=>{calls.push({method,body});return method==='GET'?{hasHistory:true,pendingJobs:2,sending:false,archived:false}:{archived:true,cleanup:{removed:0,retained:0}};}) as typeof api;
 const button=(text:string)=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 try{await act(async()=>root.render(createElement(DeleteProduct,{product:product(),request,onDone:m=>{messages.push(m);}})));assert.equal(calls.length,0);await act(async()=>button('Excluir produto').click());assert.match(container.textContent!,/históricos e mensagens|histórico|recibos/);assert.equal(button('Confirmar arquivamento').disabled,true);assert.equal(calls.filter(c=>c.method==='POST').length,0);await act(async()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await act(async()=>button('Confirmar arquivamento').click());assert.deepEqual(calls[1].body,{action:'delete',confirmed:true,cancelScheduled:true,removeImages:false});assert.match(messages[0],/arquivado/);}finally{await act(async()=>root.unmount());close();}
});
test('switching funnel tabs discards a late Telegram response instead of showing it as WhatsApp counts',async()=>{
 const {container,close}=fixture(),root=(await import('react-dom/client')).createRoot(container);let resolveTelegram:(data:any)=>void=()=>{};const telegram=new Promise(r=>{resolveTelegram=r;}),metrics={telegram:{published:7,scheduled:1,pending:2,failed:0},whatsapp:{published:0,scheduled:0,pending:3,ready:2}},request=(async(path:string)=>path.includes('channel=telegram')?telegram:{channel:'whatsapp',metrics,items:[],history:[],more:false}) as typeof api;
 try{await act(async()=>root.render(createElement(ChannelFunnels,{request})));await act(async()=>container.querySelector<HTMLButtonElement>('#funnel-tab-whatsapp')!.click());assert.equal(container.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim(),'WhatsApp');assert.equal(container.querySelector('.channel-metrics b')!.textContent,'0');await act(async()=>resolveTelegram({channel:'telegram',metrics,items:[],history:[],more:false}));assert.equal(container.querySelector('.channel-metrics b')!.textContent,'0');assert.match(container.querySelector('[role=tabpanel]')!.textContent!,/Publicadas manualmente/);}finally{await act(async()=>root.unmount());close();}
});

test('recent products and catalog show proven Telegram publication separately from price review and WhatsApp',()=>{
 const p={...product(),checkedAt:'2020-01-01T00:00:00Z'},channels={[p.id]:{telegram:{...unpublished,published:true,publishedAt:'2026-11-06T20:32:36Z',state:'sent'},whatsapp:unpublished}},callbacks={onCreate(){},onOpen(){},onPreview(){},onImport(){}};
 for(const html of [renderToStaticMarkup(createElement(DashboardOverview,{products:[p],publications:[],channelStatus:channels,overview:true,onNavigate(){},...callbacks})),renderToStaticMarkup(createElement(ProductCatalog,{products:[p],channelStatus:channels,...callbacks}))]){
  assert.match(html,/Publicado no Telegram/);assert.match(html,/WhatsApp: não publicado/);assert.match(html,/Preço:/);assert.match(html,/A conferir/);assert.doesNotMatch(html,/Publicado no WhatsApp/);
 }
});

test('dashboard upcoming uses the Telegram job date and clearly warns when automatic sends are paused',()=>{
 const p=product(),at='2026-11-07T20:00:00Z',html=renderToStaticMarkup(createElement(DashboardOverview,{products:[p],publications:[],automation:false,channelStatus:{[p.id]:{telegram:{...unpublished,state:'queued',scheduledAt:at},whatsapp:unpublished}},overview:true,onCreate(){},onOpen(){},onPreview(){},onImport(){},onNavigate(){}}));
 assert.match(html,/Agendamentos automáticos pausados/);assert.match(html,/não haverá envio automático/);assert.match(html,/Telegram agendado/);assert.match(html,/17:00/);assert.doesNotMatch(html,/Nenhum agendamento nos produtos exibidos/);
});

test('resuming automation UI explains future-only activation and reports the expired jobs retained for review',async()=>{
 const {container,close}=fixture(),root=(await import('react-dom/client')).createRoot(container),calls:any[]=[];let enabled=false;
 const request=(async(path:string,method='GET',body:any)=>{calls.push({path,method,body});if(method==='PATCH'){enabled=body.enabled;return {enabled,held:3};}return path.includes('publication-config')?{enabled,telegram:{available:true}}:{jobs:[],more:false};}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationSchedule,{request})));assert.match(container.textContent!,/horários já vencidos não serão disparados/);await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Ativar próximos agendamentos')!.click());assert.deepEqual(calls.find(c=>c.method==='PATCH').body,{enabled:true});assert.match(container.textContent!,/3 agendamento\(s\) vencido\(s\) retido\(s\)/);assert.match(container.textContent!,/Automação ativa/);}finally{await act(async()=>root.unmount());close();}
});

test('history rows show saved destination, actual and scheduled times, message link and a distinct manual actor',()=>{
 const telegram=renderToStaticMarkup(createElement(PublicationHistoryRow,{entry:historyEntry(),showProduct:true}));assert.match(telegram,/Canal salvo/);assert.match(telegram,/Enviado em:/);assert.match(telegram,/16:23/);assert.match(telegram,/Horário agendado:/);assert.match(telegram,/16:00/);assert.match(telegram,/https:\/\/t.me\/c\/123\/14/);assert.match(telegram,/Detalhes da oferta/);
 const whatsapp=renderToStaticMarkup(createElement(PublicationHistoryRow,{entry:historyEntry('whatsapp')}));assert.match(whatsapp,/Confirmado manualmente/);assert.match(whatsapp,/admin@example.test/);assert.match(whatsapp,/não é um comprovante/);assert.doesNotMatch(whatsapp,/Ver mensagem/);
 const unknown=renderToStaticMarkup(createElement(PublicationHistoryRow,{entry:{...historyEntry(),occurred_at:null}}));assert.match(unknown,/Data indisponível/);assert.doesNotMatch(unknown,/Enviado em:.*16:23/);
});

test('publication history loads lazily, paginates, filters by channel and period and never mutates or sends',async()=>{
 const {container,dom,close}=fixture(),root=(await import('react-dom/client')).createRoot(container),calls:{url:URL;method:string}[]=[],first=historyEntry(),second={...historyEntry(),product_name:'Segunda página',destination:'Outro destino'};
 const request=(async(path:string,method='GET')=>{const url=new URL(path,'https://dropou.test');calls.push({url,method});return {entries:[url.searchParams.get('page')==='1'?second:first],more:url.searchParams.get('page')==='0',page:Number(url.searchParams.get('page'))};}) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationHistory,{productId:first.product_id!,request})));assert.equal(calls.length,0);await act(async()=>{const details=container.querySelector('details')!;details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));});assert.ok(calls.length>0);assert.match(container.textContent!,/Canal salvo/);
  await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Próximas')!.click());assert.equal(calls.at(-1)!.url.searchParams.get('page'),'1');assert.match(container.textContent!,/Outro destino/);
  await act(async()=>{const select=container.querySelector<HTMLSelectElement>('select')!;select.value='whatsapp';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(calls.at(-1)!.url.searchParams.get('channel'),'whatsapp');assert.equal(calls.at(-1)!.url.searchParams.get('page'),'0');
  await act(async()=>{const input=container.querySelector<HTMLInputElement>('input[type=date]')!;Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'2026-11-06');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(calls.at(-1)!.url.searchParams.get('from'),'2026-11-06');assert.ok(calls.every(c=>c.method==='GET'));assert.ok(calls.every(c=>c.url.pathname==='/api/publication-history'));
 }finally{await act(async()=>root.unmount());close();}
});

test('late Telegram history cannot replace a selected WhatsApp history',async()=>{
 const {container,dom,close}=fixture(),root=(await import('react-dom/client')).createRoot(container);let resolveTelegram:(r:any)=>void=()=>{};const pending=new Promise(r=>{resolveTelegram=r;}),request=(async(path:string)=>new URL(path,'https://dropou.test').searchParams.get('channel')==='whatsapp'?{entries:[historyEntry('whatsapp')],more:false,page:0}:pending) as typeof api;
 try{await act(async()=>root.render(createElement(PublicationHistory,{productId:crypto.randomUUID(),initiallyOpen:true,request})));await act(async()=>{const select=container.querySelector<HTMLSelectElement>('select')!;select.value='whatsapp';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.match(container.textContent!,/Confirmado manualmente/);await act(async()=>resolveTelegram({entries:[historyEntry()],more:false,page:0}));assert.match(container.textContent!,/Confirmado manualmente/);assert.doesNotMatch(container.textContent!,/Publicado no Telegram/);}finally{await act(async()=>root.unmount());close();}
});
