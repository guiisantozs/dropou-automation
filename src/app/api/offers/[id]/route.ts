import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db}=await sessionDb(request);const id=z.string().uuid().parse((await context.params).id);
 const {error}=await db.rpc('dropou_delete_offer',{p_offer:id});if(error)throw dbError(error);
 return Response.json({ok:true});
}catch(e){return apiError(e);}}
