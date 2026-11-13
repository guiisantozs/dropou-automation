import {Product} from './domain';
import {Offer} from './offers';
import {publicationPlan,PublicationPreference} from './publication-copy';
export type PublicationJob={id:string;state:string;channel:'telegram'|'whatsapp';scheduled_at:string;destination_title:string;error?:string;attempts:number;message_ids:string[];sent_at?:string};
export type PublicationConfig={enabled:boolean;slots?:string[];timezone?:'America/Bahia';serverNow?:string;whatsapp?:{name:string;url:string};telegram:{available:boolean;id?:string;title?:string;key?:string;reason?:string}};
export type ManualPublication={id:string;channel:'whatsapp';destination:string;published_at:string;review_required?:boolean;confirmed_by?:string;confirmed_at?:string;confirmation_source?:string;caption?:string};
export type PublicationContext={destinations?:{whatsapp:{name:string;url:string}};serverNow?:string;job?:PublicationJob;jobs?:PublicationJob[];whatsapp?:ManualPublication;archived?:boolean;republications?:{id:string;channel:'telegram'|'whatsapp'}[];delivery?:{state:string;message_ids:string[];destination_title:string;sent_at?:string;error?:string}};
export function publicationBlock(product:Product,offer:Offer|undefined,text:string,busy=false,job?:Pick<PublicationJob,'state'>,preference:PublicationPreference='auto',now=Date.now()){
 if(busy)return 'Aguarde a operação terminar.';
 if(job?.state==='sent')return 'Esta oferta já foi publicada neste canal.';
 if(job&&['sending','uncertain','partial'].includes(job.state))return 'Entrega em andamento ou incerta. Confira o canal; não repita o envio.';
 if(!offer)return 'Salve a oferta antes de publicar.';
 const plan=publicationPlan(product,text,preference,now);
 if(plan.mode==='verified'&&text!==offer.caption)return 'Salve a edição da legenda antes de publicar.';
 if(offer.status==='excluido')return 'Esta oferta foi excluída. Salve uma oferta ativa para continuar.';
 return plan.error;
}
// Bahia is UTC-03 year-round. Validate the wall-clock value, independent of the browser timezone.
export function bahiaInstant(value:string){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Informe data e horário em America/Bahia.');
 const date=new Date(value+':00-03:00');if(!Number.isFinite(+date)||new Date(+date-3*3600000).toISOString().slice(0,16)!==value)throw new Error('Data ou horário inválido.');return date.toISOString();
}
export function nextPublicationSlots(times:readonly string[],now=Date.now()){
 const today=new Date(now-3*3600000).toISOString().slice(0,10);
 return [0,1].flatMap(offset=>{
  const day=new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  return [...new Set(times)].filter(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)).sort().map(time=>({value:day+'T'+time,label:(offset?'Amanhã':'Hoje')+' · '+time}));
 }).filter(slot=>Date.parse(bahiaInstant(slot.value))>now).slice(0,12);
}
export function jobLabel(state:string){return ({queued:'Agendado',blocked:'Aguardando conferência',ready:'Pronta para compartilhar',sending:'Enviando',sent:'Publicado',cancelled:'Cancelado',failed:'Falha confirmada',uncertain:'Entrega incerta · revisar canal',partial:'Publicação parcial · revisar canal'} as Record<string,string>)[state]||state;}
