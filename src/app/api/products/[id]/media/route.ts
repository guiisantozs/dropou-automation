import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {adminDb} from '@/server/db';
import {productSchema} from '@/lib/domain';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),body=z.object({expected:productSchema,path:z.string(),consent:z.literal(true)}).parse(await request.json());
 if(!new RegExp('^'+user.id+'/[a-f0-9-]{36}\\.jpg$').test(body.path)||body.expected.id!==id)throw new Error('Selecione uma foto autorizada deste produto.');
 const db=adminDb(),exists=await db.storage.from('offer-images').exists(body.path);if(exists.error||!exists.data)throw new Error('Foto não encontrada. Faça o upload novamente.');
 const r=await db.rpc('dropou_product_media',{p_owner:user.id,p_product:id,p_expected:body.expected,p_path:body.path});if(r.error)throw dbError(r.error);return Response.json({...r.data,serverNow:new Date().toISOString()});
}catch(e){return apiError(e);}}
