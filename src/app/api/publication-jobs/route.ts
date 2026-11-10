import {sessionDb,apiError,dbError} from '@/server/session';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request),page=Math.max(0,Math.min(10000,Number(new URL(request.url).searchParams.get('page'))||0));
 const r=await db.from('telegram_jobs').select('id,brand_id,product_id,state,channel,scheduled_at,destination_title,error,attempts,message_ids,sent_at,snapshot->name').eq('owner_id',user.id).order('scheduled_at',{ascending:false}).range(page*20,page*20+20);if(r.error)throw dbError(r.error);
 return Response.json({jobs:r.data.slice(0,20),more:r.data.length>20},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
