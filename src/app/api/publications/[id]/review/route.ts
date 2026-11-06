import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {adminDb} from '@/server/db';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),body=z.object({confirmed:z.literal(true),destination:z.string().trim().min(2).max(120)}).parse(await request.json());
 const result=await adminDb().rpc('dropou_review_manual_publication',{p_owner:user.id,p_publication:id,p_destination:body.destination,p_confirm:true});if(result.error)throw dbError(result.error);return Response.json({publication:result.data});
}catch(e){return apiError(e);}}
