import {sessionDb,apiError,dbError} from '@/server/session';
import {candidateSelectionSchema} from '@/lib/discovery';
import {meliForUser,shopeePending} from '@/server/discovery';
import {productKey} from '@/lib/domain';
import {attachRecordedHistory} from '@/server/discovery/history';
export const maxDuration=60;
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request),input=candidateSelectionSchema.parse(await request.json());
 const saved:string[]=[],skipped:string[]=[],errors:string[]=[];const seen=new Set<string>();
 for(const item of input.items){
  const key=`${item.store}:${item.itemId}`;if(seen.has(key))continue;seen.add(key);
  if(item.store==='Shopee'){errors.push(shopeePending().message);continue;}
  try{
   // Read the official source again; never trust a price sent by the browser.
   const [p]=await attachRecordedHistory(db,user.id,[await (await meliForUser(user.id)).lookup(item.itemId,input.category)]);
   if(p.inStock===false){errors.push(`${item.itemId}: produto esgotado ou anúncio inativo.`);continue;}
   const {data:existing,error:readError}=await db.from('products').select('id').eq('owner_id',user.id).eq('canonical_url',productKey(p)).maybeSingle();
   if(readError)throw dbError(readError);if(existing){skipped.push(existing.id);continue;}
   const {data,error}=await db.rpc('dropou_save_product',{p_data:p,p_key:productKey(p)});if(error)throw dbError(error);saved.push(data.id);
  }catch(e){errors.push(`${item.itemId}: ${e instanceof Error?e.message:'Falha ao salvar'}`);}
 }
 return Response.json({saved,skipped,errors});
}catch(e){return apiError(e);}}
