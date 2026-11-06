import 'server-only';
import {adminDb} from './db';
import {dbError} from './session';
import {telegramTarget} from './telegram';
import {sendTelegramTo,TelegramFailure} from './telegram-core';
import {captionError} from '@/lib/caption-editor';
import {productSchema,freshPrice} from '@/lib/domain';
export async function publicationAdmin(owner:string){
 const db=adminDb(),result=await db.from('telegram_dispatch_config').select('owner_ids,automation_enabled').eq('id',true).single();
 if(result.error)throw new Error('Configuração de publicação indisponível. Confira a migração e o administrador no servidor.');
 if(!result.data.owner_ids.includes(owner))throw new Error('Sua conta não está autorizada a publicar. Confira o administrador da operação.');
 return {db,enabled:result.data.automation_enabled};
}
export async function queuePublication(owner:string,offerId:string,channel:'telegram'|'whatsapp',at:string,caption:string,targetKey?:string){
 const {db}=await publicationAdmin(owner),target=channel==='telegram'?await telegramTarget():{};
 if(channel==='telegram'&&(!targetKey||targetKey!==('key' in target?target.key:'')))throw new Error('O canal configurado mudou. Confira a confirmação novamente.');
 const before=await db.from('offers').select('caption,snapshot').eq('id',offerId).eq('owner_id',owner).single();if(before.error)throw dbError(before.error);
 const issue=captionError(caption,productSchema.parse(before.data.snapshot));if(issue)throw new Error(issue);
 const result=await db.rpc('dropou_publication_queue',{p_owner:owner,p_offer:offerId,p_channel:channel,p_at:at,p_target:target,p_caption:caption});if(result.error)throw dbError(result.error);return result.data;
}
export async function dispatchJob(id:string,automatic:boolean){
 const db=adminDb(),before=await db.from('telegram_jobs').select('channel').eq('id',id).single();if(before.error)throw dbError(before.error);
 const target=before.data.channel==='telegram'?await telegramTarget():undefined;
 const claim=await db.rpc('dropou_publication_claim',{p_job:id,p_target:target?.key||'whatsapp',p_automatic:automatic});if(claim.error)throw dbError(claim.error);if(!claim.data)return {sent:false};
 const job=claim.data;
 async function receipt(ids:string[],state:string,error?:string){const result=await db.rpc('dropou_publication_receipt',{p_job:id,p_ids:ids,p_state:state,p_error:error||null});if(result.error)throw new Error('Falha ao registrar entrega. Confira o canal; não repita o envio.');}
 let receivedIds:string[]=[];
 try{
  const product=productSchema.parse(job.snapshot),issue=captionError(job.caption,product);if(issue)throw new TelegramFailure(issue,'failed');
  let image=product.image;
  if(product.imagePath){
   if(!product.imagePath.startsWith(job.owner_id+'/'))throw new TelegramFailure('Imagem não pertence ao proprietário.','failed');
   const signed=await db.storage.from('offer-images').createSignedUrl(product.imagePath,300);if(signed.error)throw new TelegramFailure('Imagem indisponível. Corrija antes de autorizar novamente.','failed');image=signed.data.signedUrl;
  }
  const ids=await sendTelegramTo(process.env,target!,job.caption,image||undefined,fetch,ids=>{receivedIds=ids;return receipt(ids,'sending');},async()=>{
   if(!freshPrice(product))throw new TelegramFailure('Conferência expirou antes do envio. Confira novamente na loja.','failed');
   if(automatic){const pause=await db.from('telegram_dispatch_config').select('automation_enabled').eq('id',true).single();if(pause.error||!pause.data.automation_enabled)throw new TelegramFailure('Automação pausada antes do envio. Autorize novamente quando retomar.','failed');}
  });
  await receipt(ids,'sent');return {sent:true,messageIds:ids,channel:target!.title};
 }catch(error){const e=error instanceof TelegramFailure?error:new TelegramFailure('Registro de entrega pendente. Confira o canal antes de repetir.','uncertain',receivedIds);await receipt(e.ids,e.outcome,e.message);throw e;}
}
export async function publishTelegram(owner:string,offerId:string,caption:string,targetKey:string){
 const job=await queuePublication(owner,offerId,'telegram',new Date().toISOString(),caption,targetKey);return dispatchJob(job.id,false);
}
