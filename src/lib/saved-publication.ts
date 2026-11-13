import type {Product} from './domain';
import type {Offer} from './offers';
import {publicationBlock,type PublicationContext} from './publication';
import {publicationPlan} from './publication-copy';
export type SavedPublication=PublicationContext&{product:Product;offer?:Offer|null};
export function savedPublicationState(value:SavedPublication|undefined,now=Date.now()){
 const job=value?.jobs?.find(j=>j.channel==='telegram'),receipt=value?.delivery;
 const posted=!!(receipt?.state==='sent'&&receipt.message_ids?.length||job?.state==='sent'&&job.message_ids?.length);
 const source=receipt&&['sending','sent','uncertain','partial'].includes(receipt.state)?receipt:job;
 const text=value?publicationPlan(value.product,value.offer?.caption||'','priced',now).text:'';
 const common=!value?'Abra o produto e confira a oferta.':value.archived?'Produto arquivado.':!value.product.image&&!value.product.imagePath?'Adicione a foto do produto.':publicationBlock(value.product,value.offer||undefined,text,false,undefined,'priced',now);
 const telegram=posted?'Postado no Telegram':common||(['queued','blocked','ready'].includes(job?.state||'')?'Já existe um agendamento. Confira antes de enviar.':publicationBlock(value!.product,value!.offer||undefined,value!.offer?.caption||'',false,source,'priced',now));
 // Copying is independent of Telegram delivery and never records a WhatsApp publication.
 return {posted,common,telegram};
}
