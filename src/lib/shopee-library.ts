import type {SavedShopeeProduct} from './shopee-saved';
import {savedPublicationState,type SavedPublication} from './saved-publication';
import {channelStateLabel} from './channel-state';
export type SavedShopeeData={publications?:Record<string,SavedPublication>;serverNow?:string;products:SavedShopeeProduct[];total:number;more:boolean;credentialsReady:boolean;budget:{used:number;limit:number;globalUsed:number;globalLimit:number}};
export type LibraryFilter='all'|'ready'|'posted'|'curation';
export function libraryPublication(data:SavedShopeeData,row:SavedShopeeProduct){return row.prepared_product_id?data.publications?.[row.prepared_product_id]:undefined;}
export function libraryState(value:SavedPublication|undefined,now:number){const state=savedPublicationState(value,now),canonical=value?.channels?.telegram.state,attention=canonical&&['sending','uncertain','partial','failed','blocked','queued'].includes(canonical)?channelStateLabel('telegram',canonical):'',telegram=state.telegram||attention;const posted=state.posted||!!value?.channels?.whatsapp.published;return {...state,telegram,attention,published:posted,ready:!posted&&!state.common&&!telegram};}
function day(time:string|undefined|null){const value=Date.parse(time||'');return Number.isFinite(value)?new Date(value-10800000).toISOString().slice(0,10):'';}
export function libraryMetrics(data:SavedShopeeData,now:number){
 const today=day(new Date(now).toISOString());let ready=0,posted=0,todayCount=0,links=0;
 for(const row of data.products){const publication=libraryPublication(data,row),state=libraryState(publication,now);if(state.ready)ready++;if(state.published)posted++;
  if(state.posted&&day(publication?.channels?.telegram.publishedAt||publication?.delivery?.sent_at)===today||publication?.channels?.whatsapp.published&&day(publication.channels.whatsapp.publishedAt)===today)todayCount++;
  if(publication?.product.affiliateUrl||row.data?.offerLink)links++;
 }return {saved:data.total,ready,posted,today:todayCount,links,curation:data.products.length-ready-posted};
}
export function libraryRows(data:SavedShopeeData,filter:LibraryFilter,query:string,sort:string,now:number){const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();return data.products.filter(row=>{const p=libraryPublication(data,row),state=libraryState(p,now);const name=(p?.product.name||row.data?.name||row.input_url).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return name.includes(q)&&(filter==='all'||filter==='ready'&&state.ready||filter==='posted'&&state.published||filter==='curation'&&!state.ready&&!state.published);}).sort((a,b)=>sort==='oldest'?Date.parse(a.created_at)-Date.parse(b.created_at):Date.parse(b.created_at)-Date.parse(a.created_at));}
export type LibraryEvent={id:string;row:SavedShopeeProduct;label:string;at:string;channel?:'telegram'|'whatsapp'};
export function libraryActivity(data:SavedShopeeData){const events:LibraryEvent[]=[];for(const row of data.products){const p=libraryPublication(data,row);events.push({id:row.id+'-saved',row,label:'Produto salvo',at:row.created_at});for(const channel of ['telegram','whatsapp'] as const){const c=p?.channels?.[channel];const at=c?.publishedAt||(channel==='telegram'&&p?.delivery?.state==='sent'?p.delivery.sent_at:undefined);if(at&&(c?.published||channel==='telegram'&&p?.delivery?.state==='sent'))events.push({id:row.id+'-'+channel,row,label:channel==='telegram'?'Publicado no Telegram':'Publicação manual no WhatsApp',at,channel});}}return events.filter(e=>Number.isFinite(Date.parse(e.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));}
/** Read every existing API page before exposing collection-wide counts or filters. */
export async function readShopeeLibrary(request:<T>(path:string)=>Promise<T>){
 const first=await request<SavedShopeeData>('/api/shopee/saved-products?page=0'),products=[...first.products],publications={...first.publications};let more=first.more,page=0;
 while(more){if(products.length>=first.total)throw new Error('A biblioteca mudou durante a leitura. Atualize a lista novamente.');const next=await request<SavedShopeeData>('/api/shopee/saved-products?page='+ ++page);if(next.total!==first.total||!next.products.length)throw new Error('A biblioteca mudou durante a leitura. Atualize a lista novamente.');products.push(...next.products);Object.assign(publications,next.publications);more=next.more;}
 if(new Set(products.map(p=>p.id)).size!==first.total||products.length!==first.total)throw new Error('A biblioteca mudou durante a leitura. Atualize a lista novamente.');
 return {...first,products,publications,more:false};
}
