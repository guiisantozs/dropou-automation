import {isShopeeOperation} from '@/lib/workspace-brands';
import {formatCaption} from '@/lib/ai';
import {shopeeLimit} from '@/lib/shopee-limits';
import {operatorAudit} from '@/server/operator-audit';
import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {saveShopeeLinks,resolveSavedShopeeProducts,savedShopeeColumns} from '@/server/shopee/saved-products';
import {shopeeProduct} from '@/lib/shopee-product';
import {dropouCaption} from '@/lib/dropou-captions';
import {reserveDropouHeadline} from '@/server/dropou-captions';
import {bahiaDay,shopeeConfigSchema,type ShopeeOffer} from '@/lib/shopee-automation';
export const runtime='nodejs';export const maxDuration=60;
async function context(request:Request){const session=await sessionDb(request);if(!isShopeeOperation(session.operation))throw new Error('Selecione Dropou | Tech & Games para importar produtos Shopee.');const admin=await publicationAdmin(session.user.id);return {...session,db:admin.db,operation:session.operation};}
export async function GET(request:Request){try{
 const {db,user,operation,actorId}=await context(request),page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0),day=bahiaDay();
 const [rows,settings,local,global]=await Promise.all([
  db.from('shopee_saved_products').select(savedShopeeColumns,{count:'exact'}).eq('owner_id',user.id).eq('brand_id',operation).order('created_at',{ascending:false}).order('id').range(page*24,page*24+23),
  db.from('operation_settings').select('shopee_config,manual_daily_limit').eq('owner_id',user.id).eq('brand_id',operation).single(),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('brand_id',operation).eq('day',day).eq('kind','manual'),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('day',day).eq('kind','manual'),
 ]);for(const r of [rows,settings,local,global])if(r.error)throw dbError(r.error);
 const ids=[...new Set((rows.data||[]).map(r=>r.prepared_product_id).filter((id):id is string=>!!id))];
 const publications:Record<string,unknown>={};
 if(ids.length){
  const [products,offers,jobs,deliveries]=await Promise.all([
   db.from('products').select('id,data,archived_at').eq('owner_id',user.id).eq('brand_id',operation).in('id',ids),
   db.from('offers').select('*').eq('owner_id',user.id).eq('brand_id',operation).in('product_id',ids).neq('status','excluido'),
   db.from('telegram_jobs').select('product_id,id,state,channel,scheduled_at,destination_title,message_ids,attempts').eq('owner_id',user.id).eq('brand_id',operation).in('product_id',ids),
   db.from('deliveries').select('product_id,state,message_ids,destination_title,sent_at').eq('owner_id',user.id).eq('brand_id',operation).eq('channel','telegram').in('product_id',ids),
  ]);
  for(const r of [products,offers,jobs,deliveries])if(r.error)throw dbError(r.error);
  for(const p of products.data||[])publications[p.id]={product:p.data,archived:!!p.archived_at,offer:offers.data?.find(o=>o.product_id===p.id),jobs:jobs.data?.filter(j=>j.product_id===p.id),delivery:deliveries.data?.find(d=>d.product_id===p.id)};
 }
 return Response.json({publications,serverNow:new Date().toISOString(),products:rows.data,total:rows.count||0,more:(rows.count||0)>(page+1)*24,budget:{used:local.count||0,limit:settings.data?.manual_daily_limit||200,globalUsed:global.count||0,globalLimit:shopeeLimit(process.env,'manual')},credentialsReady:!!process.env.SHOPEE_AFFILIATE_APP_ID&&!!process.env.SHOPEE_AFFILIATE_SECRET&&process.env.SHOPEE_AFFILIATE_APPROVED==='true'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),links:z.array(z.string().max(2048)).min(1).max(50)}),
 z.object({action:z.literal('resolve'),ids:z.array(z.string().uuid()).min(1).max(5),refresh:z.boolean().default(false)}),
 z.object({action:z.literal('prepare'),id:z.string().uuid()}),
]);
export async function POST(request:Request){try{
 const {db,user,operation,actorId}=await context(request),body=bodySchema.parse(await request.json());
 if(body.action==='save')return Response.json(await saveShopeeLinks(db,user.id,body.links,operation));
 if(body.action==='resolve')return Response.json(await resolveSavedShopeeProducts(db,user.id,body.ids,body.refresh,process.env,fetch,operation));
 const row=await db.from('shopee_saved_products').select('data,state').eq('id',body.id).eq('owner_id',user.id).eq('brand_id',operation).single();if(row.error)throw dbError(row.error);
 if(!row.data.data||row.data.state!=='ready')throw new Error('Busque os dados do produto antes de preparar a oferta.');
 const o=row.data.data as ShopeeOffer,product=shopeeProduct(o,crypto.randomUUID(),operation),headline=operation==='dropou'?await reserveDropouHeadline(db,user.id,body.id,product.name):undefined;
 const result=await db.rpc('dropou_shopee_saved_prepare_channel',{p_brand:operation,p_owner:user.id,p_id:body.id,p_product:product,p_caption:formatCaption(product,operation,headline)});if(result.error)throw dbError(result.error);
 await operatorAudit(user.id,actorId,operation,'Importa??o preparada',result.data.productId);return Response.json(result.data);
 }catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{const {db,user,operation,actorId}=await context(request),{id}=z.object({id:z.string().uuid()}).parse(await request.json());const r=await db.from('shopee_saved_products').delete().eq('id',id).eq('owner_id',user.id).eq('brand_id',operation);if(r.error)throw dbError(r.error);return Response.json({removed:true});}catch(e){return apiError(e);}}
