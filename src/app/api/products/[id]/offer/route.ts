import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const withHistory=new URL(request.url).searchParams.get('history')==='true';
 const [product,offer,jobs,publications,deliveries]=await Promise.all([
 db.from('products').select('data').eq('id',id).eq('owner_id',user.id).single(),
 db.from('offers').select('*').eq('product_id',id).eq('owner_id',user.id).neq('status','excluido').maybeSingle(),
 db.from('telegram_jobs').select('id,state,channel,scheduled_at,destination_title,error,attempts,message_ids,sent_at').eq('product_id',id).eq('owner_id',user.id).limit(1),
 withHistory?db.from('publications').select('id,channel,destination,published_at').eq('product_id',id).eq('owner_id',user.id).limit(10):Promise.resolve({data:[],error:null}),
 db.from('deliveries').select('state,message_ids,destination_title,sent_at,error').eq('product_id',id).eq('owner_id',user.id).limit(1)]);
 for(const r of [product,offer,jobs,publications,deliveries])if(r.error)throw dbError(r.error);
 return Response.json({product:product.data!.data,offer:offer.data,job:jobs.data?.[0],publications:publications.data,delivery:deliveries.data?.[0]},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
