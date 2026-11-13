import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {productSchema,productKey} from '@/lib/domain';
import {shopeeProduct} from '@/lib/shopee-product';
import {dropouCaption} from '@/lib/dropou-captions';
import {historyPeriod} from '@/lib/publication-history';
function checked(r:{data:any;error:any}){if(r.error)throw dbError(r.error);return r.data;}
export async function GET(request:Request){try{
 const {db,operation}=await sessionDb(request);if(operation!=='dropou')throw new Error('Selecione Dropou | Tech & Games.');
 const q=z.object({stage:z.enum(['curation','approved','catalog','recent','archived']).default('approved'),page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(180).default(''),store:z.enum(['Mercado Livre','Shopee']).optional(),channel:z.enum(['telegram','whatsapp']).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),dashboard:z.enum(['true','false']).default('false')}).parse(Object.fromEntries(new URL(request.url).searchParams));
 const {start,end}=historyPeriod(q.from,q.to);
 const list=q.stage==='curation'?db.rpc('dropou_curation_page',{p_page:q.page}):db.rpc('dropou_operational_products',{p_stage:q.stage,p_page:q.page,p_q:q.q,p_store:q.store||null,p_channel:q.channel||null,p_from:start,p_to:end});
 const [result,summary,recent]=await Promise.all([list,db.rpc('dropou_operation_summary'),q.dashboard==='true'?db.rpc('dropou_operational_products',{p_stage:'recent'}):Promise.resolve({data:null,error:null})]);
 const data=checked(result),counts=checked(summary),recentData=checked(recent);
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
 const {db:session,user,operation}=await sessionDb(request);if(operation!=='dropou')throw new Error('Selecione Dropou | Tech & Games.');
 const body=bodySchema.parse(await request.json()),{db}=await publicationAdmin(user.id);
 if(body.action==='mark')return Response.json(checked(await db.rpc('dropou_channel_mark',{p_owner:user.id,p_product:body.id,p_channel:body.channel,p_request:body.requestId,p_undo:body.undo||null,p_repost:body.repost})));
 let product=null,caption=null;
 if(body.decision==='approved'){
  const row=checked(await session.from(body.kind==='cache'?'shopee_offers':'products').select('data').eq('owner_id',user.id).eq('brand_id','dropou').eq('id',body.id).single());
  product=body.kind==='cache'?shopeeProduct(row.data):productSchema.parse(row.data);caption=dropouCaption(product);
  if(body.kind==='cache'){
   const prior=await session.from('products').select('data').eq('owner_id',user.id).eq('brand_id','dropou').eq('canonical_url',productKey(product)).maybeSingle();if(prior.error)throw dbError(prior.error);
   if(prior.data)caption=dropouCaption(productSchema.parse(prior.data.data));
  }
 }
 return Response.json(checked(await db.rpc('dropou_curate',{p_owner:user.id,p_kind:body.kind,p_id:body.id,p_decision:body.decision,p_product:product,p_caption:caption})));
 }catch(e){return apiError(e);}}
