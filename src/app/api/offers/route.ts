import {sessionDb,apiError,dbError} from '@/server/session';
import {caption,productSchema} from '@/lib/domain';
import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);
 const {productId,caption:selected,expected}=z.object({productId:z.string().uuid(),caption:z.string().trim().min(1).max(4000).optional(),expected:productSchema.optional()}).parse(await request.json());
 const {data:row,error:readError}=await db.from('products').select('data').eq('id',productId).eq('owner_id',user.id).single();
 if(readError)throw dbError(readError);
 const p=productSchema.parse(row.data);
 if(selected&&(!expected||!isDeepStrictEqual(p,expected)))throw new Error('Produto alterado. Confira a legenda novamente.');
 const {data,error}=await db.rpc('dropou_save_offer',{p_product:p.id,p_expected:p,p_caption:selected||caption(p)});
 if(error)throw dbError(error);
 return Response.json({offer:data});
}catch(e){return apiError(e);}}
