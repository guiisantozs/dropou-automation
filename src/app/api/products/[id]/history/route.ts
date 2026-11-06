import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await params).id);
 const {data,error}=await db.from('price_records').select('id,price,checked_at,recorded_at').eq('product_id',id).eq('owner_id',user.id).order('recorded_at',{ascending:false}).limit(30);
 if(error)throw dbError(error);return Response.json({records:data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
