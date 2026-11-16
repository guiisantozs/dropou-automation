import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {historyPeriod} from '@/lib/publication-history';
import {dbError} from './session';
export async function localProducts(db:SupabaseClient,request:Request){
 const q=z.object({stage:z.enum(['curation','catalog','approved','published','rejected','archived']).default('catalog'),page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(180).default(''),store:z.enum(['Shopee','Mercado Livre']).optional(),channel:z.enum(['telegram','whatsapp']).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).parse(Object.fromEntries(new URL(request.url).searchParams));
 const {start,end}=historyPeriod(q.from,q.to),r=await db.rpc('dropou_local_products',{p_stage:q.stage,p_page:q.page,p_q:q.q,p_store:q.store||null,p_channel:q.channel||null,p_from:start,p_to:end});if(r.error)throw dbError(r.error);
 return Response.json({...r.data,page:q.page,more:r.data.total>(q.page+1)*24,serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
