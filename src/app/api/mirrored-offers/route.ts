import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {mirrorColumns,mirrorStates} from '@/lib/mirrored-offers';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('policy'),repeatHours:z.number().int().min(0).max(8760),dailyLimit:z.number().int().min(0).max(1000)}).strict(),
 z.object({action:z.enum(['ready','pending','discard','retry']),id:z.uuid(),version:z.number().int().positive()}).strict(),
]);
function missing(code?:string){return ['42P01','PGRST205','PGRST202','42883'].includes(code||'');}
export async function GET(request:Request){try{
 const s=await sessionDb(request);if(s.operation==='all')throw new Error('Selecione um canal para consultar as ofertas espelhadas.');
 const url=new URL(request.url),history=url.searchParams.get('history');
 if(history){const id=z.uuid().parse(history),r=await s.db.from('mirror_offer_events').select('id,from_state,to_state,attempt,detail,created_at').eq('owner_id',s.user.id).eq('brand_id',s.operation).eq('offer_id',id).order('created_at').limit(250);if(r.error)throw new Error('Não foi possível ler o histórico.');return Response.json({events:r.data},{headers});}
 const page=z.coerce.number().int().min(0).max(10000).parse(url.searchParams.get('page')||0),filter=url.searchParams.get('state')||'all';
 let q=s.db.from('mirror_offers').select(mirrorColumns,{count:'exact'}).eq('owner_id',s.user.id).eq('brand_id',s.operation);
 if(filter==='history')q=q.in('state',['discarded','published']);else if(filter==='pending')q=q.in('state',['received','identified','processing','affiliated','pending_review']);else if(filter!=='all')q=q.eq('state',z.enum(mirrorStates).parse(filter));
 const [rows,policy]=await Promise.all([q.order('received_at',{ascending:false}).order('id').range(page*24,page*24+23),s.db.from('mirror_channel_policies').select('repeat_hours,mirror_daily_limit').eq('owner_id',s.user.id).eq('brand_id',s.operation).maybeSingle()]);
 if(missing(rows.error?.code)||missing(policy.error?.code))return Response.json({available:false,items:[],total:0,more:false,admin:s.access.admin,policy:{repeat_hours:24,mirror_daily_limit:10},error:'Fila persistente preparada. A migração incremental ainda precisa ser autorizada e aplicada.'},{headers});
 if(rows.error||policy.error)throw new Error('Não foi possível carregar as ofertas espelhadas.');
 return Response.json({available:true,items:rows.data,total:rows.count||0,more:(rows.count||0)>(page+1)*24,admin:s.access.admin,policy:policy.data||{repeat_hours:24,mirror_daily_limit:10}},{headers});
 }catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const s=await sessionDb(request);if(s.operation==='all')throw new Error('Selecione um canal.');
 const raw=await request.text();if(raw.length>2048)throw new Error('Solicitação muito grande.');const cmd=input.parse(JSON.parse(raw));
 if(cmd.action==='policy'&&!s.access.admin)throw new Error('FORBIDDEN: Somente administradores alteram políticas e orçamento.');
 if(cmd.action!=='policy'){const row=await s.db.from('mirror_offers').select('id').eq('id',cmd.id).eq('owner_id',s.user.id).eq('brand_id',s.operation).maybeSingle();if(row.error||!row.data)throw new Error('FORBIDDEN: Oferta indisponível neste canal.');}
 const {db}=await publicationAdmin(s.user.id);
 const result=cmd.action==='policy'?await db.rpc('dropou_mirror_policy',{p_owner:s.user.id,p_actor:s.actorId,p_brand:s.operation,p_hours:cmd.repeatHours,p_limit:cmd.dailyLimit}):await db.rpc('dropou_mirror_review',{p_owner:s.user.id,p_actor:s.actorId,p_brand:s.operation,p_id:cmd.id,p_version:cmd.version,p_action:cmd.action});
 if(result.error){if(result.error.code==='P0001')throw new Error(result.error.message);throw new Error('A ação não foi confirmada. Atualize o painel antes de tentar novamente.');}
 return Response.json({ok:result.data},{headers});
 }catch(e){return apiError(e);}}
