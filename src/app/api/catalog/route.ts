import {z} from 'zod';
import {catalogFiltersSchema} from '@/lib/catalog';
import {historyPeriod} from '@/lib/publication-history';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
export async function GET(request:Request){try{
 const {db,operation,access}=await sessionDb(request),q=catalogFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 if(q.operation&&(!access.brands.includes(q.operation)||operation!=='all'&&operation!==q.operation))throw new Error('FORBIDDEN: Operação indisponível neste catálogo.');
 const period=historyPeriod(q.from,q.to),result=await db.rpc('dropou_catalog_page',{p_filters:{...q,operation:operation==='all'?q.operation:operation,pinned:q.pinned==='true',from:period.start,to:period.end}});
 if(result.error)throw dbError(result.error);
 return Response.json({...result.data,page:q.page,more:result.data.total>(q.page+1)*24},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
const pinSchema=z.object({id:z.string().uuid(),kind:z.enum(['product','saved']),pinned:z.boolean()});
export async function PATCH(request:Request){try{
 const {db:session,user,operation,actorId}=await sessionDb(request),body=pinSchema.parse(await request.json());
 const scoped=await session.from(body.kind==='product'?'products':'shopee_saved_products').select('id,brand_id').eq('owner_id',user.id).eq('id',body.id).maybeSingle();
 if(scoped.error)throw dbError(scoped.error);if(!scoped.data||operation!=='all'&&operation!==scoped.data.brand_id)throw new Error('FORBIDDEN: Produto indisponível nesta operação.');
 const {db}=await publicationAdmin(user.id),result=await db.rpc('dropou_catalog_pin',{p_owner:user.id,p_brand:scoped.data.brand_id,p_actor:actorId,p_id:body.id,p_kind:body.kind,p_pinned:body.pinned});
 if(result.error)throw dbError(result.error);return Response.json(result.data);
 }catch(e){return apiError(e);}}
