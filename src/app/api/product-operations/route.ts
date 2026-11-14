import {isShopeeOperation} from '@/lib/workspace-brands';
import {formatCaption} from '@/lib/ai';
import {operatorAudit} from '@/server/operator-audit';
import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {productSchema,productKey} from '@/lib/domain';
import {shopeeProduct} from '@/lib/shopee-product';
import {dropouCaption} from '@/lib/dropou-captions';
import {historyPeriod} from '@/lib/publication-history';
import {loadCuratedDiscovery} from '@/server/shopee/curation';
function checked(r:{data:any;error:any}){if(r.error)throw dbError(r.error);return r.data;}
export async function GET(request:Request){try{
 const {db,user,operation}=await sessionDb(request);if(!isShopeeOperation(operation))throw new Error('Selecione Dropou | Tech & Games.');
 const q=z.object({stage:z.enum(['curation','approved','catalog','recent','archived']).default('approved'),page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(180).default(''),store:z.enum(['Mercado Livre','Shopee']).optional(),channel:z.enum(['telegram','whatsapp']).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),dashboard:z.enum(['true','false']).default('false')}).parse(Object.fromEntries(new URL(request.url).searchParams));
 const {start,end}=historyPeriod(q.from,q.to);
 const list=q.stage==='curation'?Promise.resolve({data:null,error:null}):db.rpc('dropou_operational_products',{p_stage:q.stage,p_page:q.page,p_q:q.q,p_store:q.store||null,p_channel:q.channel||null,p_from:start,p_to:end});
 const [result,summary,recent,curated]=await Promise.all([list,db.rpc('dropou_operation_summary'),q.dashboard==='true'?db.rpc('dropou_operational_products',{p_stage:'recent'}):Promise.resolve({data:null,error:null}),loadCuratedDiscovery(db,user.id,operation)]);
 const data=q.stage==='curation'?{total:curated.length,rows:curated.slice(q.page*24,(q.page+1)*24)}:checked(result),counts={...checked(summary),pending:curated.length},recentData=checked(recent);
 const ids=[...new Set<string>([...(q.stage==='curation'?[]:data.rows.map((r:any)=>r.id)),...(recentData?.rows.map((r:any)=>r.id)||[])])];
 const chunks=[];for(let i=0;i<ids.length;i+=24)chunks.push(ids.slice(i,i+24));
 const channels=(await Promise.all(chunks.map(p_ids=>db.rpc('dropou_product_channel_summaries',{p_ids})))).flatMap(r=>checked(r));
 return Response.json({...data,summary:counts,recent:recentData?.rows||[],recentTotal:recentData?.total||0,channels:Object.fromEntries(channels.map((r:any)=>[r.product_id,{telegram:r.telegram,whatsapp:r.whatsapp}])),page:q.page,more:data.total>(q.page+1)*24,serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('mark'),id:z.string().uuid(),channel:z.enum(['telegram','whatsapp']),requestId:z.string().uuid(),undo:z.string().uuid().optional(),repost:z.boolean().default(false)}),
 z.object({action:z.literal('decide'),id:z.string().uuid(),kind:z.enum(['cache','product']),decision:z.enum(['approved','rejected'])}),
]);
export async function POST(request:Request){try{
 const {db:session,user,operation,actorId}=await sessionDb(request);if(!isShopeeOperation(operation))throw new Error('Selecione Dropou | Tech & Games.');
 const body=bodySchema.parse(await request.json()),{db}=await publicationAdmin(user.id);
 if(body.action==='mark'){const result=checked(await db.rpc('dropou_channel_mark_channel',{p_brand:operation,p_owner:user.id,p_product:body.id,p_channel:body.channel,p_request:body.requestId,p_undo:body.undo||null,p_repost:body.repost}));await operatorAudit(user.id,actorId,operation,body.undo?'Marcação desfeita':'Publicado manualmente no '+body.channel,body.id);return Response.json(result);}
 let product=null,caption=null;
 if(body.decision==='approved'){
  const row=checked(await session.from(body.kind==='cache'?'shopee_offers':'products').select('data').eq('owner_id',user.id).eq('brand_id',operation).eq('id',body.id).single());
  if(body.kind==='cache'){
   const candidates=await loadCuratedDiscovery(session,user.id,operation);
   const candidate=candidates.find(c=>c.id===body.id&&c.kind==='cache');
   if(!candidate||candidate.kind!=='cache')throw new Error('Este item saiu das recomendações. Atualize a curadoria antes de aprovar.');
   const assessment=candidate.assessment;
   checked(await db.from('shopee_offers').update({assessment,score:assessment.score,eligible:assessment.eligible,reasons:assessment.reasons}).eq('owner_id',user.id).eq('brand_id',operation).eq('id',body.id).eq('checked_at',row.data.checkedAt).select('id').single());
  }
  product=body.kind==='cache'?shopeeProduct(row.data,crypto.randomUUID(),operation):productSchema.parse(row.data);caption=formatCaption(product,operation);
  if(body.kind==='cache'){
   const prior=await session.from('products').select('data').eq('owner_id',user.id).eq('brand_id',operation).eq('canonical_url',productKey(product)).maybeSingle();if(prior.error)throw dbError(prior.error);
   if(prior.data)caption=formatCaption(productSchema.parse(prior.data.data),operation);
  }
 }
 const result=checked(await db.rpc('dropou_curate_channel',{p_brand:operation,p_owner:user.id,p_kind:body.kind,p_id:body.id,p_decision:body.decision,p_product:product,p_caption:caption}));await operatorAudit(user.id,actorId,operation,body.decision==='approved'?'Produto aprovado':'Produto rejeitado',body.id);return Response.json(result);
 }catch(e){return apiError(e);}}
