import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {adminDb} from '@/server/db';
import {removeUnusedImages} from '@/server/product-lifecycle';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),r=await adminDb().rpc('dropou_product_lifecycle',{p_owner:user.id,p_product:id,p_action:'inspect',p_confirm:false,p_cancel:false});if(r.error)throw dbError(r.error);return Response.json(r.data,{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),body=z.object({action:z.enum(['delete','archive','restore']),confirmed:z.literal(true),cancelScheduled:z.boolean().default(false),removeImages:z.boolean().default(false)}).parse(await request.json());
 const r=await adminDb().rpc('dropou_product_lifecycle',{p_owner:user.id,p_product:id,p_action:body.action,p_confirm:true,p_cancel:body.cancelScheduled});if(r.error)throw dbError(r.error);
 let cleanup={removed:0,retained:(r.data.images||[]).length},cleanupMessage:string|undefined;
 if(body.removeImages&&r.data.deleted)try{cleanup=await removeUnusedImages(user.id,r.data.images||[]);}catch(e){cleanupMessage=(e as Error).message;}
 return Response.json({...r.data,cleanup,cleanupMessage});
}catch(e){return apiError(e);}}
