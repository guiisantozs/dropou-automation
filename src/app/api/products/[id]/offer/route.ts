import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),withHistory=new URL(request.url).searchParams.get('history')==='true';
 const [product,offer,jobs,publications,deliveries,events,intents]=await Promise.all([
 db.from('products').select('data,archived_at').eq('id',id).eq('owner_id',user.id).single(),
 db.from('offers').select('*').eq('product_id',id).eq('owner_id',user.id).neq('status','excluido').maybeSingle(),
 db.from('telegram_jobs').select('id,state,channel,scheduled_at,destination_title,error,attempts,message_ids,sent_at,media_mode,photo_confirmed').eq('product_id',id).eq('owner_id',user.id),
 db.from('publications').select('id,channel,destination,published_at,confirmed_by,confirmed_at,confirmation_source,review_required,caption').eq('product_id',id).eq('owner_id',user.id).order('published_at',{ascending:false}).limit(10),
 db.from('deliveries').select('state,message_ids,destination_title,sent_at,error').eq('product_id',id).eq('channel','telegram').eq('owner_id',user.id).maybeSingle(),
 withHistory?db.from('channel_events').select('id,channel,event,attempt,destination,message_ids,error,created_at').eq('product_id',id).eq('owner_id',user.id).order('created_at',{ascending:false}).limit(50):Promise.resolve({data:[],error:null}),
 db.from('republication_intents').select('id,channel').eq('owner_id',user.id).eq('product_id',id).is('used_at',null)]);
 for(const r of [product,offer,jobs,publications,deliveries,events,intents])if(r.error)throw dbError(r.error);
 const brand=product.data!.data.operation||'dropou',settings=await db.from('operation_settings').select('whatsapp_name,whatsapp_url').eq('owner_id',user.id).eq('brand_id',brand).single();if(settings.error)throw dbError(settings.error);
 return Response.json({destinations:{whatsapp:{name:settings.data.whatsapp_name,url:settings.data.whatsapp_url}},serverNow:new Date().toISOString(),product:product.data!.data,archived:!!product.data!.archived_at,offer:offer.data,jobs:jobs.data,job:jobs.data?.find(j=>j.channel==='telegram'),whatsapp:publications.data?.[0],publications:withHistory?publications.data:[],delivery:deliveries.data,events:events.data,republications:intents.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
