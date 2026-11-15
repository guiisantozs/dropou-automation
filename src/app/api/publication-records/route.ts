import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {historyPeriod,telegramMessageLinks} from '@/lib/publication-history';
import {publicationRange,type PublishedRecord} from '@/lib/publication-workspace';
export async function GET(request:Request){try{
 const {db,user,access}=await sessionDb(request),q=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),channel:z.enum(['telegram','whatsapp']).optional(),actor:z.string().uuid().optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),period:z.enum(['today','yesterday','week','month','custom']).default('today')}).parse(Object.fromEntries(new URL(request.url).searchParams));
 if(q.actor&&!access.admin)throw new Error('FORBIDDEN: Somente administradores filtram por operador.');
 const range=q.period==='custom'?q:publicationRange(q.period),{start,end}=historyPeriod(range.from,range.to);
 const r=await db.rpc('dropou_publication_records_page',{p_page:q.page,p_from:start,p_to:end,p_channel:q.channel||null,p_actor:q.actor||null});if(r.error)throw dbError(r.error);
 const members=access.admin?await db.from('operation_members').select('member_id,role').eq('owner_id',user.id):{data:[],error:null};if(members.error)throw dbError(members.error);
 const operators=[{id:user.id,label:'Administrador'},...(members.data||[]).map(m=>({id:m.member_id,label:(m.role==='admin'?'Administrador':'Operador')+' · '+m.member_id.slice(-4)}))];
 const names=new Map(operators.map(o=>[o.id,o.label]));
 const entries=(r.data.entries as PublishedRecord[]).map(e=>({...e,actor_name:e.actor_id?names.get(e.actor_id)||'Operador · '+e.actor_id.slice(-4):undefined,message_links:e.channel==='telegram'?telegramMessageLinks(e.destination_id,e.message_ids,'sent'):[]}));
 return Response.json({...r.data,entries,operators:access.admin?operators:[],admin:access.admin,allowedBrands:access.brands,serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('mark'),productId:z.string().uuid(),requestId:z.string().uuid(),confirmed:z.literal(true),cancelScheduled:z.boolean().default(false)}),
 z.object({action:z.literal('undo'),id:z.string().uuid(),source:z.enum(['manual_mark','whatsapp_manual']),confirmed:z.literal(true)}),
]);
export async function POST(request:Request){try{
 const {user,actorId,operation}=await sessionDb(request);if(operation==='all')throw new Error('Selecione o canal do registro.');
 const body=bodySchema.parse(await request.json()),{db}=await publicationAdmin(user.id);
 const result=body.action==='mark'?await db.rpc('dropou_publication_mark_actor',{p_owner:user.id,p_brand:operation,p_product:body.productId,p_actor:actorId,p_channel:'whatsapp',p_request:body.requestId,p_undo:null,p_repost:false,p_cancel:body.cancelScheduled}):await db.rpc('dropou_publication_undo',{p_owner:user.id,p_brand:operation,p_id:body.id,p_source:body.source,p_actor:actorId});
 if(result.error)throw dbError(result.error);return Response.json(result.data);
}catch(e){return apiError(e);}}
