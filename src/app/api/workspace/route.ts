import {sessionDb,apiError,dbError} from '@/server/session';
import {productSchema} from '@/lib/domain';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request),params=new URL(request.url).searchParams;
 const page=Math.max(0,Math.min(10000,Math.floor(Number(params.get('page'))||0))),historyPage=Math.max(0,Math.min(10000,Math.floor(Number(params.get('historyPage'))||0))),withHistory=params.get('history')==='true';
 const query=(params.get('q')||'').trim().slice(0,180);
 let selection=db.from('products').select('id,data',{count:'exact'}).eq('owner_id',user.id).eq('data->>store','Mercado Livre').eq('data->>demo','false');
 if(query)selection=selection.ilike('data->>name','%'+query.replaceAll('%','').replaceAll('_','')+'%');
 const [rows,summary]=await Promise.all([selection.order('created_at',{ascending:false}).order('id').range(page*24,page*24+23),db.rpc('dropou_workspace_metrics')]);
 if(rows.error)throw dbError(rows.error);if(summary.error)throw dbError(summary.error);
 const ids=rows.data.map(r=>r.id),products=rows.data.map(r=>productSchema.parse(r.data));
 const [offers,publications,logs]=await Promise.all([
 ids.length?db.from('offers').select('*').eq('owner_id',user.id).in('product_id',ids).neq('status','excluido') : Promise.resolve({data:[],error:null}),
 withHistory?db.from('publications').select('*').eq('owner_id',user.id).order('published_at',{ascending:false}).range(historyPage*20,historyPage*20+20):Promise.resolve({data:[],error:null}),
 withHistory?db.from('logs').select('event,detail,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).range(historyPage*20,historyPage*20+20):Promise.resolve({data:[],error:null})]);
 for(const r of [offers,publications,logs])if(r.error)throw dbError(r.error);
 return Response.json({products,offers:offers.data||[],publications:(publications.data||[]).slice(0,20),logs:(logs.data||[]).slice(0,20),summary:summary.data,total:rows.count,more:(rows.count||0)>(page+1)*24,historyMore:(publications.data?.length||0)>20||(logs.data?.length||0)>20},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
