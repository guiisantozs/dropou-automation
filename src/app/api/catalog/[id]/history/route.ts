import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),{id}=await params;z.uuid().parse(id);
 const page=z.coerce.number().int().min(0).max(10000).default(0).parse(new URL(request.url).searchParams.get('page')||0);
 const p=await db.from('products').select('id').eq('owner_id',user.id).eq('id',id).maybeSingle();if(p.error)throw dbError(p.error);if(!p.data)throw new Error('FORBIDDEN: Produto indisponível nesta operação.');
 const [history,destinations]=await Promise.all([
 db.from('dropou_confirmed_publications').select('id,channel,destination,destination_id,occurred_at,source,message_ids',{count:'exact'}).eq('owner_id',user.id).eq('product_id',id).order('occurred_at',{ascending:false,nullsFirst:false}).order('id').range(page*20,page*20+19),
 db.rpc('dropou_catalog_destinations',{p_ids:[id]})]);
 if(history.error)throw dbError(history.error);if(destinations.error)throw dbError(destinations.error);
 return Response.json({entries:history.data,total:history.count,page,more:(history.count||0)>(page+1)*20,destinations:destinations.data?.[0]?.destinations||[]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
