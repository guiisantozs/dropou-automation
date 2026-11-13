import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {recentPublicationDays,historyPeriod,telegramMessageLinks,type PublicationHistoryEntry} from '@/lib/publication-history';
import {productSchema} from '@/lib/domain';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request),query=z.object({marketplace:z.enum(['Mercado Livre','Shopee']).optional(),status:z.enum(['sent','manual_confirmed','queued','ready','failed','blocked','uncertain','partial','review']).optional(),channel:z.enum(['all','telegram','whatsapp']).default('all'),productId:z.string().uuid().optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),page:z.coerce.number().int().min(0).max(10000).default(0),attempts:z.enum(['true','false']).default('false')}).parse(Object.fromEntries(new URL(request.url).searchParams));
 const period=new URL(request.url).searchParams.get('latest')==='true'?recentPublicationDays():query;const {start,end}=historyPeriod(period.from,period.to);
 const r=await db.rpc('dropou_publication_history_v2',{p_product:query.productId||null,p_channel:query.channel==='all'?null:query.channel,p_from:start,p_to:end,p_page:query.page,p_attempts:query.attempts==='true',p_marketplace:query.marketplace||null,p_status:query.status||null});if(r.error)throw dbError(r.error);
 const rows=(r.data||[]) as PublicationHistoryEntry[],ids=[...new Set(rows.slice(0,20).flatMap(row=>row.product_id?[row.product_id]:[]))];
 const images=ids.length?await db.from('products').select('id,data').eq('owner_id',user.id).in('id',ids):{data:[],error:null};
 const media=new Map((images.data||[]).map(row=>{const p=productSchema.safeParse(row.data);return [row.id,p.success?{name:p.data.name,niche:p.data.niche,image:p.data.image,imagePath:p.data.imagePath,thumbnailPath:p.data.thumbnailPath}:undefined];}));
 const entries=rows.slice(0,20).map(row=>({...row,product_media:row.product_id?media.get(row.product_id):undefined,confirmed_by_name:row.confirmed_by?(row.confirmed_by===user.id?user.email||'Sua conta':row.confirmed_by):null,message_links:row.channel==='telegram'?telegramMessageLinks(row.destination_id,row.message_ids,row.status):[]}));
 return Response.json({entries,more:rows.length>20,page:query.page},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
