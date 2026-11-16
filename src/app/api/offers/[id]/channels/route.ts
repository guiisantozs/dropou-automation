import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin,dispatchJob} from '@/server/telegram-offer';
import {telegramTarget} from '@/server/telegram';
import {operationSchema} from '@/lib/workspace-brands';
import {productSchema} from '@/lib/domain';
import {publicationCaptionError} from '@/lib/publication-copy';
import {telegramPresentationError} from '@/lib/telegram-presentation';
export const maxDuration=60;
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user,db,access}=await sessionDb(request),id=z.uuid().parse((await context.params).id);
 const source=await db.from('offers').select('product_id').eq('id',id).eq('owner_id',user.id).single();if(source.error)throw dbError(source.error);
 const {db:admin}=await publicationAdmin(user.id),settings=await admin.from('operation_settings').select('*').eq('owner_id',user.id).in('brand_id',access.brands);if(settings.error)throw dbError(settings.error);
 const origin=await admin.from('products').select('canonical_url').eq('id',source.data.product_id).eq('owner_id',user.id).single();if(origin.error)throw dbError(origin.error);
 const products=await admin.from('products').select('id,brand_id,archived_at,curation_state').eq('owner_id',user.id).eq('canonical_url',origin.data.canonical_url).in('brand_id',access.brands);if(products.error)throw dbError(products.error);
 const jobs=await admin.from('telegram_jobs').select('product_id,channel,state').eq('owner_id',user.id).in('product_id',products.data.map(p=>p.id));if(jobs.error)throw dbError(jobs.error);
 const proofs=await admin.from('dropou_confirmed_publications').select('product_id,channel').eq('owner_id',user.id).in('product_id',products.data.map(p=>p.id));if(proofs.error)throw dbError(proofs.error);
 const whatsappOptions=settings.data.map(s=>{const product=products.data.find(p=>p.brand_id===s.brand_id),published=proofs.data.some(p=>p.product_id===product?.id&&p.channel==='whatsapp'),pending=jobs.data.some(j=>j.product_id===product?.id&&j.channel==='whatsapp'&&['queued','ready','blocked','failed','sending','partial','uncertain'].includes(j.state)),configured=/^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]+|whatsapp\.com\/channel\/[A-Za-z0-9]+)\/?$/.test(s.whatsapp_url||''),blocked=product&&(product.archived_at||product.curation_state==='rejected');return {brand:s.brand_id,name:s.display_name,title:s.whatsapp_name||s.display_name,url:s.whatsapp_url||'',available:configured&&!published&&!blocked&&!pending,published,reason:published?'Publicação manual já confirmada':blocked?'Produto arquivado ou rejeitado neste canal':pending?'Confira o agendamento ou entrega deste destino':!configured?'Configure o destino WhatsApp':''};});
 const options=await Promise.all(settings.data.map(async s=>{
  let id=s.telegram_chat_id,title=s.telegram_title,verified=!!s.telegram_verified_at,reason='';
  const tokenPresent=!!process.env[s.telegram_bot_env||'TELEGRAM_BOT_TOKEN'];
  if(id&&tokenPresent&&!verified){try{const t=await telegramTarget(user.id,s.brand_id,true);id=t.id;title=t.title;verified=true;}catch(e){reason=(e as Error).message;}}
  const product=products.data.find(p=>p.brand_id===s.brand_id),job=jobs.data.find(j=>j.product_id===product?.id&&j.channel==='telegram'&&['queued','ready','sending','partial','uncertain','sent'].includes(j.state));
  const blocked=product&&(product.archived_at||product.curation_state==='rejected')?'Produto arquivado ou rejeitado neste canal.':job&&['queued','ready','sending','partial','uncertain','sent'].includes(job.state)?job.state==='sent'?'Esta oferta já foi publicada neste canal.':'Já existe agendamento ou envio em andamento/incerto neste canal.':'';
  return {brand:s.brand_id,name:s.display_name,title:title||id||'Destino não configurado',id,key:id&&verified?createHash('sha256').update(id).digest('hex'):null,available:!!id&&verified&&tokenPresent&&!blocked,reason:blocked||reason||(!id?'Configure o destino Telegram deste canal.':!tokenPresent?'Token do bot não configurado na Vercel.':!verified?'Verifique a permissão do bot.':''),enabled:s.automation_enabled};
 }));
 return Response.json({options,whatsappOptions},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
const schema=z.object({requestId:z.uuid(),confirmed:z.literal(true),expected:productSchema,caption:z.string().min(1).max(4000),targets:z.array(z.object({brand:operationSchema,key:z.string().length(64)})).min(1).max(6),scheduledAt:z.string().datetime().optional(),mediaMode:z.enum(['photo','link_preview','text']),photoConfirmed:z.boolean()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user,actorId,access}=await sessionDb(request),id=z.uuid().parse((await context.params).id),body=schema.parse(await request.json());
 if(new Set(body.targets.map(t=>t.brand)).size!==body.targets.length||body.targets.some(t=>!access.brands.includes(t.brand)))throw new Error('FORBIDDEN: Selecione somente canais distintos autorizados.');
 if(body.scheduledAt&&Date.parse(body.scheduledAt)<=Date.now())throw new Error('Escolha um horário futuro.');
 const issue=publicationCaptionError(body.caption,body.expected,'verified')||telegramPresentationError(body.expected,body);if(issue)throw new Error(issue);
 const {db}=await publicationAdmin(user.id);
 // A repeated HTTP request only reads the reserved jobs. It never dispatches again.
 const prior=await db.from('publication_batches').select('actor_id,source_offer,payload,jobs').eq('id',body.requestId).eq('owner_id',user.id).maybeSingle();if(prior.error)throw dbError(prior.error);
 let jobs:{id:string;brand:string}[],alreadyReserved=!!prior.data;
 if(prior.data){if(prior.data.actor_id!==actorId||prior.data.source_offer!==id||!isDeepStrictEqual(prior.data.payload,body))throw new Error('Esta autorização já foi utilizada com outros dados.');jobs=prior.data.jobs;
 }else{
  const targets=await Promise.all(body.targets.map(async choice=>{const target=await telegramTarget(user.id,choice.brand,true);if(target.key!==choice.key)throw new Error('Um destino mudou. Abra a seleção de canais novamente.');return {...target,brand:choice.brand,mediaMode:body.mediaMode,photoConfirmed:body.photoConfirmed};}));
  if(body.mediaMode==='photo'&&body.expected.imagePath){const exists=await db.storage.from('offer-images').exists(body.expected.imagePath);if(!body.expected.imagePath.startsWith(user.id+'/')||exists.error||!exists.data)throw new Error('Foto autorizada indisponível.');}
  const queued=await db.rpc('dropou_multichannel_queue',{p_owner:user.id,p_actor:actorId,p_offer:id,p_request:body.requestId,p_expected:body.expected,p_caption:body.caption,p_targets:targets,p_at:body.scheduledAt||new Date().toISOString(),p_payload:body});if(queued.error)throw dbError(queued.error);jobs=queued.data.jobs;alreadyReserved=queued.data.alreadyReserved;
 }
 const outcomes=[];
 for(const job of jobs){if(!body.scheduledAt&&!alreadyReserved){try{await dispatchJob(job.id,false);}catch{/* The existing dispatcher persists failure, partial or uncertainty. Never retry here. */}}
  const state=await db.from('telegram_jobs').select('id,state,error,message_ids,scheduled_at,sent_at,destination_title').eq('owner_id',user.id).eq('id',job.id).single();if(state.error)throw dbError(state.error);outcomes.push({...state.data,brand:job.brand});}
 return Response.json({outcomes,alreadyReserved});
}catch(e){return apiError(e);}}

const manualSchema=z.object({brand:operationSchema,requestId:z.uuid(),confirmed:z.literal(true),expected:productSchema,caption:z.string().min(1).max(4000)});
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user,actorId,access}=await sessionDb(request),id=z.uuid().parse((await context.params).id),body=manualSchema.parse(await request.json());
 if(!access.brands.includes(body.brand))throw new Error('FORBIDDEN: Destino não autorizado.');
 const {db}=await publicationAdmin(user.id);
 const marked=await db.rpc('dropou_shared_whatsapp_mark',{p_owner:user.id,p_actor:actorId,p_offer:id,p_brand:body.brand,p_request:body.requestId,p_expected:body.expected,p_caption:body.caption});if(marked.error)throw dbError(marked.error);
 return Response.json(marked.data);
}catch(e){return apiError(e);}}
