import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await params).id);
 const page=Math.max(0,Math.min(10000,Math.floor(Number(new URL(request.url).searchParams.get('page'))||0)));
 const {data,error}=await db.from('price_records').select('id,price,checked_at,recorded_at').eq('product_id',id).eq('owner_id',user.id).order('recorded_at',{ascending:false}).range(page*20,page*20+20);
 if(error)throw dbError(error);return Response.json({records:data?.slice(0,20),more:(data?.length||0)>20},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
