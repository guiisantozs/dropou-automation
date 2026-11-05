import {sessionDb,apiError} from '@/server/session';
import {discoveryFiltersSchema,eligibleCandidates} from '@/lib/discovery';
import {discover} from '@/server/discovery';
import {attachRecordedHistory} from '@/server/discovery/history';
export const maxDuration=60;
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);const f=discoveryFiltersSchema.parse(await request.json()),result=await discover({...f,minDiscount:0},user.id);
 result.products=eligibleCandidates(await attachRecordedHistory(db,user.id,result.products),f);
 for(const source of result.sources){if(source.state==='available'){source.found=result.products.filter(p=>p.store===source.store).length;source.message=source.found?`${source.found} produtos passaram pelos filtros e verificações oficiais.`:'Nenhum produto passou pelos filtros com histórico comprovado. Reduza o desconto mínimo para incluir itens sem referência anterior.';}}
 const {error}=await db.from('logs').insert({owner_id:user.id,event:'Busca oficial de ofertas',detail:JSON.stringify({requested:f.limit,category:f.category,found:result.products.length,sources:result.sources.map(s=>({store:s.store,state:s.state,httpStatus:s.httpStatus,message:s.message}))})});
 if(error)return Response.json({...result,warning:'Consulta concluída, mas não foi possível gravar o log.'},{headers:{'Cache-Control':'no-store'}});
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
