import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {caption,productSchema} from '@/lib/domain';
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);const {productIds}=z.object({productIds:z.array(z.string().uuid()).min(1).max(20)}).parse(await request.json());
 const prepared:string[]=[],errors:string[]=[];
 for(const id of [...new Set(productIds)]){try{
  const {data:row,error:readError}=await db.from('products').select('data').eq('id',id).eq('owner_id',user.id).single();if(readError)throw dbError(readError);
  const p=productSchema.parse(row.data);if(p.demo||p.status==='publicado')continue;
  const {data,error}=await db.rpc('dropou_save_offer',{p_product:p.id,p_expected:p,p_caption:caption(p)});if(error)throw dbError(error);prepared.push(data.id);
 }catch(e){errors.push(`${id}: ${(e as Error).message}`);}}
 return Response.json({prepared,errors});
}catch(e){return apiError(e);}}
