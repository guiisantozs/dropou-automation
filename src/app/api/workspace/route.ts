import {sessionDb,apiError,dbError} from '@/server/session';
import {productSchema} from '@/lib/domain';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request);
 const results=await Promise.all([
  db.from('products').select('data').eq('owner_id',user.id).order('created_at',{ascending:false}),
  db.from('offers').select('*').eq('owner_id',user.id).neq('status','excluido').order('updated_at',{ascending:false}),
  db.from('publications').select('*').eq('owner_id',user.id).order('published_at',{ascending:false}),
  db.from('logs').select('event,detail,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(100),
 ]);
 for(const result of results)if(result.error)throw dbError(result.error);
 const products=(results[0].data||[]).map(row=>productSchema.parse(row.data)).filter(p=>!p.demo);
 const ids=new Set(products.map(p=>p.id));
 return Response.json({products,offers:(results[1].data||[]).filter(row=>ids.has(row.product_id as string)),publications:(results[2].data||[]).filter(row=>ids.has(row.product_id as string)),logs:results[3].data||[]},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
