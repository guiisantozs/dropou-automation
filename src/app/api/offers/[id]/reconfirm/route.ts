import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {z} from 'zod';
import {productSchema} from '@/lib/domain';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),{db}=await publicationAdmin(user.id),id=z.string().uuid().parse((await context.params).id);
 const {expected}=z.object({expected:productSchema,confirmed:z.literal(true)}).parse(await request.json());
 const result=await db.rpc('dropou_publication_reconfirm',{p_owner:user.id,p_offer:id,p_expected:expected});if(result.error)throw dbError(result.error);return Response.json({offer:result.data,serverNow:result.data.snapshot.checkedAt});
}catch(e){return apiError(e);}}
