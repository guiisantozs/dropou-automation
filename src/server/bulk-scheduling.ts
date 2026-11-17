import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {dbError} from './session';
import {telegramTarget} from './telegram';
import {publicationAdmin} from './telegram-offer';
import {operationSettings} from './operations';
import {operationSupports} from '@/lib/operation-capabilities';
import {productSchema} from '@/lib/domain';
import {shopeeProduct} from '@/lib/shopee-product';
import type {ShopeeOffer} from '@/lib/shopee-automation';
import {pricedDraftCaption} from '@/lib/publication-copy';
import {batchDataIssue,batchRefKey,batchPrepareSchema,type BatchCandidate,type BatchReviewItem} from '@/lib/bulk-scheduling';
import type {OperationId} from '@/lib/workspace-brands';
import type {z} from 'zod';
type Context={db:SupabaseClient;owner:string;actor:string;operation:string;brands:string[]};
function scope(ctx:Context,brand:string){if(!ctx.brands.includes(brand)||(ctx.operation!=='all'&&ctx.operation!==brand))throw new Error('FORBIDDEN: Operação indisponível para esta sessão.');}
async function target(owner:string,brand:OperationId,channel:'telegram'|'whatsapp'){
 if(!operationSupports(brand,channel==='telegram'?'telegramSchedule':'whatsappDestination'))throw new Error('FORBIDDEN: Agendamento indisponível neste canal.');
 if(channel==='telegram')return telegramTarget(owner,brand,true);
 const {db}=await publicationAdmin(owner),s=await operationSettings(db,owner,brand);if(!s.whatsapp_name)throw new Error('Configure o destino WhatsApp desta operação.');
 return {title:s.whatsapp_name,key:createHash('sha256').update(JSON.stringify([owner,brand,s.whatsapp_name,s.whatsapp_url])).digest('hex')};
}
async function executor(db:SupabaseClient,owner:string,brand:OperationId,channel:string){
 if(channel==='whatsapp')return {authorized:false,note:'WhatsApp é um lembrete: o compartilhamento e a confirmação continuam manuais.'};
 const s=await operationSettings(db,owner,brand),r=await db.from('telegram_dispatch_config').select('automation_enabled').eq('id',true).single();if(r.error)throw dbError(r.error);
 const authorized=!operationSupports(brand,'automaticPublishing')||s.automation_enabled&&r.data.automation_enabled;
 return {authorized,note:authorized?'O executor existente inicia no horário escolhido e processa até um produto por minuto. Dados e permissões serão revalidados; salvar não garante entrega.':'O executor desta operação está pausado. O lote será salvo, mas o envio depende da liberação existente pelo administrador.'};
}
export async function prepareScheduleBatch(ctx:Context,body:z.infer<typeof batchPrepareSchema>){
 scope(ctx,body.operation);const {db}=await publicationAdmin(ctx.owner);
 const fingerprint=createHash('sha256').update(JSON.stringify({...body,items:[...body.items].sort((a,b)=>batchRefKey(a).localeCompare(batchRefKey(b)))})).digest('hex');
 const prior=await db.from('schedule_batches').select('*').eq('id',body.id).maybeSingle();if(prior.error)throw dbError(prior.error);
 if(prior.data){if(prior.data.owner_id!==ctx.owner||prior.data.actor_id!==ctx.actor||prior.data.fingerprint!==fingerprint)throw new Error('Identificador de lote já utilizado com outros dados.');return {...prior.data,executor:await executor(db,ctx.owner,body.operation,body.channel)};}
 const destination=await target(ctx.owner,body.operation,body.channel);
 const rows=await ctx.db.rpc('dropou_schedule_candidates',{p_channel:body.channel,p_refs:body.items.map(i=>({id:i.id,kind:i.kind}))});if(rows.error)throw dbError(rows.error);
 const candidates=rows.data.rows as BatchCandidate[],drafts:{ref:typeof body.items[number];candidate?:BatchCandidate;productId?:string;error?:string}[]=[];
 for(const ref of body.items){const c=candidates.find(c=>c.id===ref.id&&c.kind===ref.kind&&c.brand_id===body.operation);const draft:{ref:typeof ref;candidate?:BatchCandidate;productId?:string;error?:string}={ref,candidate:c};drafts.push(draft);
  try{
   if(!c)throw new Error('Produto indisponível nesta operação.');if(c.expired||c.archived_at||c.curation_state==='rejected')throw new Error('Produto expirado, arquivado ou rejeitado. Revise o cadastro explicitamente.');
   if(c.pending)throw new Error('Já existe envio ou agendamento neste destino.');
   if(c.kind==='saved'&&!c.product_id){if(c.saved_state!=='ready')throw new Error('Busque os dados deste produto antes de agendar.');const original=await ctx.db.from('shopee_saved_products').select('data').eq('id',ref.id).eq('owner_id',ctx.owner).eq('brand_id',body.operation).single();if(original.error)throw dbError(original.error);
    const p=shopeeProduct(original.data.data as ShopeeOffer,crypto.randomUUID(),body.operation),r=await db.rpc('dropou_shopee_saved_prepare_channel',{p_brand:body.operation,p_owner:ctx.owner,p_id:ref.id,p_product:p,p_caption:pricedDraftCaption(p)});if(r.error)throw dbError(r.error);draft.productId=r.data.productId;
   }else draft.productId=c.product_id||c.id;
  }catch(e){draft.error=(e as Error).message;}
 }
 const ids=[...new Set(drafts.flatMap(d=>d.productId?[d.productId]:[]))];
 const [products,offers]=ids.length?await Promise.all([ctx.db.from('products').select('id,data,archived_at,curation_state').eq('owner_id',ctx.owner).eq('brand_id',body.operation).in('id',ids),ctx.db.from('offers').select('id,product_id,caption').eq('owner_id',ctx.owner).eq('brand_id',body.operation).neq('status','excluido').in('product_id',ids)]):[{data:[],error:null},{data:[],error:null}];for(const r of [products,offers])if(r.error)throw dbError(r.error);
 const items:BatchReviewItem[]=await Promise.all(drafts.map(async d=>{
  const item:BatchReviewItem={key:batchRefKey(d.ref),name:d.candidate?.data.name||'Produto indisponível',productId:d.productId,repost:d.ref.repost,publishedAt:d.candidate?.published_at,error:d.error};
  if(item.error)return item;
  try{const row=products.data?.find(p=>p.id===d.productId);if(!row||row.archived_at||row.curation_state==='rejected')throw new Error('Produto indisponível.');const parsed=productSchema.safeParse(row.data);if(!parsed.success)throw new Error('O cadastro contém dados obrigatórios inválidos ou incompletos. Confira nome, preço, foto e link antes de agendar.');const p=parsed.data,o=offers.data?.find(o=>o.product_id===p.id);item.expected=p;item.offerId=o?.id;item.caption=o?.caption||pricedDraftCaption(p);item.presentation={mediaMode:p.image||p.imagePath?'photo':'text',photoConfirmed:true};
   item.error=batchDataIssue(p,item.caption!,d.candidate?.source_data)||undefined;if(item.publishedAt&&!item.repost)item.error='Já publicado neste destino. Marque a intenção explícita de republicar ou retire o item.';
   if(p.imagePath){if(!p.imagePath.startsWith(ctx.owner+'/'))throw new Error('A foto não pertence a esta conta.');const exists=await db.storage.from('offer-images').exists(p.imagePath);if(exists.error||!exists.data)throw new Error('Foto indisponível. Corrija a apresentação no cadastro.');}
  }catch(e){item.error=(e as Error).message;}return item;
 }));
 const result=await db.rpc('dropou_schedule_batch_prepare',{p_owner:ctx.owner,p_actor:ctx.actor,p_brand:body.operation,p_id:body.id,p_at:body.scheduledAt,p_channel:body.channel,p_fingerprint:fingerprint,p_target:destination,p_items:items});if(result.error)throw dbError(result.error);
 return {...result.data,executor:await executor(db,ctx.owner,body.operation,body.channel)};
}
export async function confirmScheduleBatch(ctx:Context,id:string){
 const {db}=await publicationAdmin(ctx.owner),r=await db.from('schedule_batches').select('*').eq('id',id).eq('owner_id',ctx.owner).single();if(r.error)throw dbError(r.error);const b=r.data;scope(ctx,b.brand_id);if(b.actor_id!==ctx.actor)throw new Error('FORBIDDEN: Somente o responsável pela revisão pode confirmar este lote.');
 if(b.state==='completed')return b.result;
 const current=await target(ctx.owner,b.brand_id,b.channel);if(current.key!==b.target.key)throw new Error('O destino ou bot mudou. Prepare o lote novamente.');
 const result=await db.rpc('dropou_schedule_batch_commit',{p_owner:ctx.owner,p_actor:ctx.actor,p_id:id,p_target_key:current.key,p_confirmed:true});if(result.error)throw dbError(result.error);return result.data;
}
