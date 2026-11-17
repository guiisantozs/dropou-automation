import type {Product} from './domain';
import type {Offer} from './offers';
import type {PublicationContext} from './publication';
import type {PublicationConfig} from './publication';
import {channelState,type Channel} from './channel-state';
import {publicationPlan,savedCaptionError} from './publication-copy';
import {telegramPresentationError,type TelegramPresentation} from './telegram-presentation';
import type {api} from './api';
export type QuickOfferReads={model:Promise<QuickOfferData>;destinations:Promise<PublicationConfig>};
/** One explicit opening: parallel reads and optional idempotent import preparation. */
export function beginQuickOfferRead(request:typeof api,id:string,operation:string,source?:'saved'):QuickOfferReads{
 // Preparing an imported link only reuses its saved data. It never reviews,
 // publishes, schedules or consults the marketplace.
 const model=Promise.resolve().then(async()=>{
  const prepared=source==='saved'?await request<{productId:string;needsReview?:boolean}>('/api/shopee/saved-products','POST',{action:'prepare',id}):undefined;
  const productId=prepared?.productId||id;
  const value=await request<QuickOfferData>('/api/products/'+productId+'/offer');
  assertQuickOfferScope(value,productId,operation);
  return prepared?{...value,preparationNeedsReview:prepared.needsReview}:value;
 });
 const destinations=Promise.resolve().then(()=>request<PublicationConfig>('/api/publication-config'));
 // The modal chunk may arrive later than a failed request. Preserve the rejection
 // for its UI while preventing an unhandled promise before that UI mounts.
 void model.catch(()=>{});void destinations.catch(()=>{});
 return {model,destinations};
}
export type QuickOfferData=PublicationContext&{product:Product;offer?:Offer|null;preparationNeedsReview?:boolean};

/** Missing/edited offers are saved by the same action; safety guards still apply. */
export function quickPublicationReason(data:QuickOfferData,text:string,channel:Channel,now:number,media:TelegramPresentation){
 if(data.archived)return 'Produto arquivado. Restaure-o no catálogo antes de publicar.';
 const state=channelState(channel,data,!!data.offer,data.product);
 if(['sending','partial','uncertain'].includes(state))return 'Entrega em andamento, parcial ou incerta. Confira o canal; não repita o envio.';
 const intent=data.republications?.some(i=>i.channel===channel);
 if(state==='sent'&&!intent)return channel==='telegram'?'Esta oferta já foi publicada no Telegram.':'Publicação manual já confirmada no WhatsApp.';
 if(state==='review')return 'Histórico em revisão. Confira a confirmação antiga nas opções avançadas.';
 const job=data.jobs?.find(j=>j.channel===channel)||(data.job?.channel===channel?data.job:undefined);
 if(job&&['queued','ready','blocked'].includes(job.state))return 'Já existe um agendamento neste canal. Revise a agenda antes de continuar.';
 if(data.preparationNeedsReview)return 'Confira o preço, a variação e a legenda importados neste modal. Ajuste os detalhes se necessário e salve os dados exibidos antes de publicar.';
 const plan=publicationPlan(data.product,text,'priced',now);
 return savedCaptionError(text,data.product)||plan.error||(channel==='telegram'?telegramPresentationError(data.product,media):null);
}

export function quickOfferNeedsSave(data:QuickOfferData,text:string){return !data.offer||data.offer.status==='excluido'||data.offer.caption!==text||JSON.stringify(data.offer.snapshot)!==JSON.stringify(data.product);}

export function assertQuickOfferScope(data:QuickOfferData,id:string,operation:string){
 if(data.product.id!==id||(data.product.operation||'dropou')!==operation||data.offer&&data.offer.product_id!==id)throw new Error('A oferta recebida não pertence a este produto e operação. Feche e atualize a lista.');
 return data;
}

/** Existing save/review APIs only. Never sends a message or changes automation. */
export async function storeQuickOffer(request:typeof api,data:QuickOfferData,text:string,review=false):Promise<QuickOfferData>{
 if(data.archived)throw new Error('Produto arquivado.');
 const issue=savedCaptionError(text,data.product);if(issue)throw new Error(issue);
 const result=await request<{offer:Offer;serverNow?:string}>('/api/offers','POST',{productId:data.product.id,caption:text,originalCaption:data.offer?.original_caption||data.offer?.caption||text,manualEdit:text!==(data.offer?.original_caption||data.offer?.caption||text),expected:data.product,review});
 assertQuickOfferScope({product:result.offer.snapshot,offer:result.offer},data.product.id,data.product.operation||'dropou');
 return {...data,preparationNeedsReview:review?false:data.preparationNeedsReview,product:result.offer.snapshot,offer:result.offer,serverNow:result.serverNow||data.serverNow};
}
