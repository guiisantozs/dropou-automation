import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {saveShopeeLinks,resolveSavedShopeeProducts,savedShopeeColumns} from '@/server/shopee/saved-products';
import {shopeeProduct} from '@/lib/shopee-product';
import {dropouCaption} from '@/lib/dropou-captions';
import {reserveDropouHeadline} from '@/server/dropou-captions';
import {bahiaDay,shopeeConfigSchema,type ShopeeOffer} from '@/lib/shopee-automation';
export const runtime='nodejs';export const maxDuration=60;
async function context(request:Request){const session=await sessionDb(request);if(session.operation!=='dropou')throw new Error('Selecione Dropou | Tech & Games para importar produtos Shopee.');const admin=await publicationAdmin(session.user.id);return {db:admin.db,user:session.user};}
export async function GET(request:Request){try{
 const {db,user}=await context(request),page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0),day=bahiaDay();
 const [rows,settings,local,global]=await Promise.all([
  db.from('shopee_saved_products').select(savedShopeeColumns,{count:'exact'}).eq('owner_id',user.id).eq('brand_id','dropou').order('created_at',{ascending:false}).order('id').range(page*24,page*24+23),
  db.from('operation_settings').select('shopee_config').eq('owner_id',user.id).eq('brand_id','dropou').single(),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('brand_id','dropou').eq('day',day),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('day',day),
 ]);for(const r of [rows,settings,local,global])if(r.error)throw dbError(r.error);
 return Response.json({products:rows.data,total:rows.count||0,more:(rows.count||0)>(page+1)*24,budget:{used:local.count||0,limit:shopeeConfigSchema.parse(settings.data?.shopee_config).dailyLimit,globalUsed:global.count||0,globalLimit:Number(process.env.SHOPEE_DAILY_REQUEST_LIMIT||10)},credentialsReady:!!process.env.SHOPEE_AFFILIATE_APP_ID&&!!process.env.SHOPEE_AFFILIATE_SECRET&&process.env.SHOPEE_AFFILIATE_APPROVED==='true'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),links:z.array(z.string().max(2048)).min(1).max(50)}),
 z.object({action:z.literal('resolve'),ids:z.array(z.string().uuid()).min(1).max(5),refresh:z.boolean().default(false)}),
 z.object({action:z.literal('prepare'),id:z.string().uuid()}),
]);
export async function POST(request:Request){try{
 const {db,user}=await context(request),body=bodySchema.parse(await request.json());
 if(body.action==='save')return Response.json(await saveShopeeLinks(db,user.id,body.links));
 if(body.action==='resolve')return Response.json(await resolveSavedShopeeProducts(db,user.id,body.ids,body.refresh));
 const row=await db.from('shopee_saved_products').select('data,state').eq('id',body.id).eq('owner_id',user.id).eq('brand_id','dropou').single();if(row.error)throw dbError(row.error);
 if(!row.data.data||row.data.state!=='ready')throw new Error('Busque os dados do produto antes de preparar a oferta.');
 const o=row.data.data as ShopeeOffer,product=shopeeProduct(o),headline=await reserveDropouHeadline(db,user.id,body.id,product.name);
 const result=await db.rpc('dropou_shopee_saved_prepare',{p_owner:user.id,p_id:body.id,p_product:product,p_caption:dropouCaption(product,headline)});if(result.error)throw dbError(result.error);
 return Response.json(result.data);
 }catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{const {db,user}=await context(request),{id}=z.object({id:z.string().uuid()}).parse(await request.json());const r=await db.from('shopee_saved_products').delete().eq('id',id).eq('owner_id',user.id).eq('brand_id','dropou');if(r.error)throw dbError(r.error);return Response.json({removed:true});}catch(e){return apiError(e);}}
