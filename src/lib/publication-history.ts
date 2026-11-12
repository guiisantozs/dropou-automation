import type {Product} from './domain';
import {bahiaInstant} from './publication';
export const publicationTimezone='America/Bahia';
export type PublicationHistoryEntry={product_media?:Pick<Product,'name'|'niche'|'image'|'imagePath'|'thumbnailPath'>;brand_id?:string;marketplace?:string;next_scheduled_at?:string|null;id:string;product_id:string|null;product_name:string;channel:'telegram'|'whatsapp';status:string;occurred_at:string|null;recorded_at:string|null;scheduled_at:string|null;destination:string|null;destination_id:string|null;message_ids:string[];confirmed_by:string|null;confirmed_by_name?:string|null;is_republication:boolean;publication_round:string|null;error:string|null;review_required:boolean;message_links?:{id:string;url:string}[]};
export type PublicationHistoryResponse={entries:PublicationHistoryEntry[];more:boolean;page:number};
export function publicationDate(value?:string|null){
 if(!value||!Number.isFinite(Date.parse(value)))return 'Data indisponível';
 return new Intl.DateTimeFormat('pt-BR',{timeZone:publicationTimezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
export function historyPeriod(from?:string,to?:string){
 const start=from?bahiaInstant(from+'T00:00'):null,end=to?new Date(Date.parse(bahiaInstant(to+'T00:00'))+86400000).toISOString():null;
 if(start&&end&&Date.parse(start)>=Date.parse(end))throw new Error('O início do período deve ser anterior ou igual ao fim.');
 return {start,end};
}
export function telegramMessageLinks(destinationId:string|null,ids:unknown,status:string){
 if(status!=='sent'||!destinationId||!/^\-100[1-9]\d*$/.test(destinationId)||!Array.isArray(ids))return [];
 return [...new Set(ids)].filter((id):id is string=>typeof id==='string'&&/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id))).map(id=>({id,url:'https://t.me/c/'+destinationId.slice(4)+'/'+id}));
}
export function historyStatus(entry:Pick<PublicationHistoryEntry,'channel'|'status'|'is_republication'>){
 if(entry.status==='sent')return entry.is_republication?'Republicado no Telegram':'Publicado no Telegram';
 if(entry.status==='manual_confirmed')return entry.is_republication?'Republicação confirmada manualmente':'Confirmado manualmente';
 return ({review:'Histórico em revisão',queued:'Agendado',sending:'Envio em andamento',partial:'Publicação parcial · revisar',uncertain:'Entrega incerta · revisar',failed:'Falha no envio',blocked:'Aguardando revisão',cancelled:'Agendamento cancelado',republication_authorized:'Republicação autorizada',ready:'Pronto para compartilhar'} as Record<string,string>)[entry.status]||'Registro de auditoria';
}
