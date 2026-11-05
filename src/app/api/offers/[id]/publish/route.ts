import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db}=await sessionDb(request);const id=z.string().uuid().parse((await context.params).id);
 const {data,error}=await db.rpc('dropou_publish_offer',{p_offer:id});if(error)throw dbError(error);
 return Response.json({publication:data});
}catch(e){return apiError(e);}}
