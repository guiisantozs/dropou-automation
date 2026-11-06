import {sessionDb,apiError,dbError} from '@/server/session';
import {channelState} from '@/lib/channel-state';
import {productSchema} from '@/lib/domain';
import type {ChannelContext} from '@/lib/channel-state';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request),params=new URL(request.url).searchParams,channel=params.get('channel')==='whatsapp'?'whatsapp':'telegram',page=Math.max(0,Math.min(10000,Number(params.get('page'))||0)),history=params.get('history')==='true';
 const [metrics,products,events]=await Promise.all([
 db.rpc('dropou_channel_metrics'),
 db.from('products').select('id,data').eq('owner_id',user.id).is('archived_at',null).eq('data->>demo','false').eq('data->>store','Mercado Livre').order('created_at',{ascending:false}).range(page*20,page*20+20),
 history?(channel==='telegram'?db.from('channel_events').select('id,product_id,product_name,event,attempt,destination,message_ids,error,created_at').eq('owner_id',user.id).eq('channel','telegram').order('created_at',{ascending:false}).range(page*20,page*20+20):db.from('publications').select('id,product_id,snapshot,destination,published_at,confirmed_by,confirmation_source,review_required').eq('owner_id',user.id).eq('channel','whatsapp').order('published_at',{ascending:false}).range(page*20,page*20+20)):Promise.resolve({data:[],error:null})]);
 for(const r of [metrics,products,events])if(r.error)throw dbError(r.error);
 const rows=(products.data||[]).slice(0,20),ids=rows.map(p=>p.id);
 const [offers,jobs,receipts]=ids.length?await Promise.all([
 db.from('offers').select('product_id').eq('owner_id',user.id).in('product_id',ids).neq('status','excluido'),
 db.from('telegram_jobs').select('id,product_id,state,channel,message_ids,scheduled_at').eq('owner_id',user.id).eq('channel',channel).in('product_id',ids),
 channel==='telegram'?db.from('deliveries').select('product_id,state,message_ids').eq('owner_id',user.id).eq('channel','telegram').in('product_id',ids):db.from('publications').select('id,product_id,channel,review_required,confirmed_by').eq('owner_id',user.id).eq('channel','whatsapp').in('product_id',ids)
 ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
 for(const r of [offers,jobs,receipts])if(r.error)throw dbError(r.error);
 const items=rows.map(row=>{const product=productSchema.parse(row.data),job=jobs.data?.find(j=>j.product_id===row.id),receipt=receipts.data?.find(r=>r.product_id===row.id),context={jobs:job?[job]:[],...(channel==='telegram'?{delivery:receipt}:{whatsapp:receipt})} as ChannelContext;return {id:row.id,name:product.name,state:channelState(channel,context,!!offers.data?.some(o=>o.product_id===row.id),product),scheduledAt:job?.scheduled_at};});
 return Response.json({channel,metrics:metrics.data,items,history:(events.data||[]).slice(0,20),more:(products.data?.length||0)>20||history&&(events.data?.length||0)>20},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
