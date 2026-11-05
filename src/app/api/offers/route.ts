import {sessionDb,apiError,dbError} from '@/server/session';
import {caption,productSchema} from '@/lib/domain';
import {z} from 'zod';
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);
 const {productId}=z.object({productId:z.string().uuid()}).parse(await request.json());
 const {data:row,error:readError}=await db.from('products').select('data').eq('id',productId).eq('owner_id',user.id).single();
 if(readError)throw dbError(readError);
 const p=productSchema.parse(row.data);
 const {data,error}=await db.rpc('dropou_save_offer',{p_product:p.id,p_expected:p,p_caption:caption(p)});
 if(error)throw dbError(error);
 return Response.json({offer:data});
}catch(e){return apiError(e);}}
