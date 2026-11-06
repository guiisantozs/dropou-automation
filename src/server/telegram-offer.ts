import 'server-only';
import {adminDb} from './db';
import {sendTelegram} from './telegram';
import {dbError} from './session';
import {productSchema,publicationError} from '@/lib/domain';
export async function publishTelegram(owner:string,offerId:string){
 if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)throw new Error('Configure o bot e o canal Telegram no servidor.');
 const db=adminDb();
 const {data,error}=await db.rpc('dropou_economy_claim_telegram',{p_owner:owner,p_offer:offerId});
 if(error){if(error.code==='23505')throw new Error('Envio já registrado ou em andamento. Confira o Telegram antes de repetir.');throw dbError(error);}
 const product=productSchema.parse(data.product);
 let image=product.image;
 if(product.imagePath){
  if(!product.imagePath.startsWith(owner+'/'))throw new Error('Imagem não pertence ao proprietário.');
  const result=await db.storage.from('offer-images').createSignedUrl(product.imagePath,300);
  if(result.error)throw new Error('Imagem indisponível; envio retido para revisão.');image=result.data.signedUrl;
 }
 const blocked=publicationError(product);if(blocked)throw new Error(blocked);
 const messageId=await sendTelegram(data.caption,image||undefined);
 const result=await db.rpc('dropou_economy_finish_telegram',{p_owner:owner,p_offer:offerId,p_message:messageId});
 if(result.error)throw new Error('Envio confirmado pelo Telegram; falha ao registrar. Não repita: revise a entrega no banco.');
 return messageId;
}
