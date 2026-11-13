import {loadCuratedDiscovery} from '@/server/shopee/curation';
import {sessionDb,apiError,dbError} from '@/server/session';
import {productSchema} from '@/lib/domain';

export async function GET(request:Request){try{
 const {db,user,operation}=await sessionDb(request),params=new URL(request.url).searchParams;
 const page=Math.max(0,Math.min(10000,Math.floor(Number(params.get('page'))||0))),historyPage=Math.max(0,Math.min(10000,Math.floor(Number(params.get('historyPage'))||0))),withHistory=params.get('history')==='true';
 const archived=params.get('archived')==='true';
 const query=(params.get('q')||'').trim().slice(0,180);
 let selection=db.from('products').select('id,data',{count:'exact'}).eq('owner_id',user.id).eq('data->>demo','false');
 selection=archived?selection.not('archived_at','is',null):selection.is('archived_at',null);
 if(query)selection=selection.ilike('data->>name','%'+query.replaceAll('%','').replaceAll('_','')+'%');
 const [rows,summary,automation]=await Promise.all([selection.order('created_at',{ascending:false}).order('id').range(page*24,page*24+23),db.rpc('dropou_workspace_metrics'),operation==='all'?Promise.resolve({data:null,error:null}):db.from('operation_settings').select('automation_enabled').eq('owner_id',user.id).eq('brand_id',operation).maybeSingle()]);
 if(rows.error)throw dbError(rows.error);if(summary.error)throw dbError(summary.error);if(automation.error)throw dbError(automation.error);
 const ids=rows.data.map(r=>r.id),products=rows.data.map(r=>productSchema.parse(r.data));
 const [offers,publications,logs,channels]=await Promise.all([
 ids.length?db.from('offers').select('*').eq('owner_id',user.id).in('product_id',ids).neq('status','excluido') : Promise.resolve({data:[],error:null}),
 withHistory?db.from('publications').select('*').eq('owner_id',user.id).order('published_at',{ascending:false}).range(historyPage*20,historyPage*20+20):Promise.resolve({data:[],error:null}),
 withHistory?db.from('logs').select('event,detail,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).range(historyPage*20,historyPage*20+20):Promise.resolve({data:[],error:null}),
 ids.length?db.rpc('dropou_product_channel_summaries',{p_ids:ids}):Promise.resolve({data:[],error:null})]);
 for(const r of [offers,publications,logs,channels])if(r.error)throw dbError(r.error);
 const channelStatus=Object.fromEntries((channels.data||[]).map((r:{product_id:string;telegram:unknown;whatsapp:unknown})=>[r.product_id,{telegram:r.telegram,whatsapp:r.whatsapp}]));
 let curation:null|{pending:number;approved:number;rejected:number}=null;
 if(operation==='dropou'||operation==='all'){
  const counts=await Promise.all(['found','approved','rejected'].map(decision=>db.from('shopee_offers').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('brand_id','dropou').eq('assessment->>relevant','true').eq('decision',decision)));
  const pending=await loadCuratedDiscovery(db,user.id);
  if(counts.every(c=>!c.error))curation={pending:pending.length,approved:counts[1].count||0,rejected:counts[2].count||0};
 }
 return Response.json({curation,products,channelStatus,automation:automation.data?.automation_enabled??null,offers:offers.data||[],publications:(publications.data||[]).slice(0,20),logs:(logs.data||[]).slice(0,20),summary:summary.data,total:rows.count,more:(rows.count||0)>(page+1)*24,historyMore:(publications.data?.length||0)>20||(logs.data?.length||0)>20},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
