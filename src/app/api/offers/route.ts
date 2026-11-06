import {sessionDb,apiError,dbError} from '@/server/session';
import {caption,productSchema} from '@/lib/domain';
import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {savedCaptionError} from '@/lib/publication-copy';
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);
 const {productId,caption:selected,expected,originalCaption,manualEdit}=z.object({productId:z.string().uuid(),caption:z.string().min(1).max(4000).optional(),originalCaption:z.string().min(1).max(4000).optional(),manualEdit:z.boolean().default(false),expected:productSchema.optional()}).parse(await request.json());
 const {data:row,error:readError}=await db.from('products').select('data').eq('id',productId).eq('owner_id',user.id).single();
 if(readError)throw dbError(readError);
 const p=productSchema.parse(row.data);
 if(selected&&(!expected||!isDeepStrictEqual(p,expected)))throw new Error('Produto alterado. Confira a legenda novamente.');
 if(selected){const issue=savedCaptionError(selected,p);if(issue)throw new Error(issue);}
 const {data,error}=await db.rpc('dropou_save_offer_version',{p_product:p.id,p_expected:p,p_caption:selected||caption(p),p_original:originalCaption||selected||caption(p),p_manual:manualEdit});
 if(error)throw dbError(error);
 return Response.json({offer:data});
}catch(e){return apiError(e);}}
