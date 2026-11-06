import type {Product} from './domain';
import {publicationIdentityError} from './publication-copy';
export type Channel='telegram'|'whatsapp';
export type ProductChannelSummary={telegram:ChannelSummary;whatsapp:ChannelSummary};
export type ChannelSummary={published:boolean;publishedAt:string|null;state:string|null;scheduledAt:string|null;review?:boolean};
export type ChannelContext={jobs?:{channel:Channel;state:string;message_ids:string[]}[];job?:{channel:Channel;state:string;message_ids:string[]};delivery?:{state:string;message_ids:string[]};whatsapp?:{review_required?:boolean;confirmed_by?:string|null};archived?:boolean};
export function channelState(channel:Channel,context:ChannelContext,hasOffer:boolean,product?:Product){
 if(channel==='whatsapp'&&context.whatsapp){if(context.whatsapp.review_required)return 'review';if(context.whatsapp.confirmed_by)return 'sent';return 'review';}
 const job=context.jobs?.find(j=>j.channel===channel)||(context.job?.channel===channel?context.job:undefined);
 if(channel==='telegram'&&context.delivery){if(context.delivery.state==='sent'&&context.delivery.message_ids?.length)return 'sent';if(['sending','uncertain','partial'].includes(context.delivery.state)||context.delivery.state==='failed'&&(!job||job.state==='failed'))return context.delivery.state;}
 if(job){if(job.state==='sent')return channel==='telegram'&&job.message_ids?.length?'sent':channel==='whatsapp'?'ready':'review';return job.state;}
 if(context.archived)return 'archived';
 return !hasOffer?'not_published':product&&publicationIdentityError(product)?'blocked':'ready';
}
export function channelStateLabel(channel:Channel,state:string){return ({not_published:'Não publicada',ready:channel==='telegram'?'Pronta para publicar':'Pronta para compartilhar',queued:channel==='telegram'?'Agendada':'Agendada para compartilhamento manual',sending:'Publicando',sent:channel==='telegram'?'Publicada':'Publicada manualmente',failed:'Falhou',cancelled:'Cancelada',blocked:'Aguardando ação',uncertain:'Entrega incerta · revisar',partial:'Publicação parcial · revisar',review:'Histórico legado · revisar confirmação',archived:'Produto arquivado'} as Record<string,string>)[state]||state;}
