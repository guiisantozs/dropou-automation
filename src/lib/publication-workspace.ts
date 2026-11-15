import type {Product} from './domain';
import type {ProductChannelSummary} from './channel-state';
import type {PublicationJob} from './publication';
import type {PublicationHistoryEntry} from './publication-history';
export type ScheduledDestination=PublicationJob&{brand_id:string;product_id:string;offer_id:string;name:string;data:Product};
export type SchedulePage={jobs:ScheduledDestination[];channels:Record<string,ProductChannelSummary>;more:boolean;total:number;serverNow:string;summary:{today:number;pending:number;attention:number;next:string|null}};
export type PublishedRecord=PublicationHistoryEntry&{source:'telegram_receipt'|'whatsapp_manual'|'manual_mark';snapshot:Product;actor_id:string|null;actor_name?:string};
export type RecordsPage={entries:PublishedRecord[];more:boolean;total:number;serverNow:string;allowedBrands:string[];admin:boolean;operators:{id:string;label:string}[]};
export type DatePreset='today'|'yesterday'|'week'|'month'|'custom';
export const publicationDay=(now=Date.now())=>new Date(now-3*3600000).toISOString().slice(0,10);
export function publicationRange(preset:DatePreset,now=Date.now()){
 const today=publicationDay(now),shift=(days:number)=>new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
 return preset==='yesterday'?{from:shift(-1),to:shift(-1)}:preset==='week'?{from:shift(-6),to:today}:preset==='month'?{from:today.slice(0,8)+'01',to:today}:{from:today,to:today};
}
export function schedulingStatus(job:Pick<ScheduledDestination,'state'|'channel'|'scheduled_at'>,now=Date.now()){
 if(job.state==='sent')return job.channel==='telegram'?'Publicado':'Publicado manualmente';
 if(job.state==='failed')return 'Falhou';if(job.state==='sending')return 'Publicando';if(job.state==='uncertain')return 'Entrega incerta';if(job.state==='partial')return 'Envio parcial';if(job.state==='blocked')return 'Precisa de revisão';
 if(['queued','ready'].includes(job.state)&&Date.parse(job.scheduled_at)<now)return job.channel==='whatsapp'?'Pendente manual · atrasado':'Atrasado';
 return job.channel==='whatsapp'?'Envio manual agendado':'Agendado';
}
export function scheduleBucket(job:ScheduledDestination,now=Date.now()){
 if(['blocked','failed','partial','uncertain'].includes(job.state)||Date.parse(job.scheduled_at)<now)return 'attention';
 const day=publicationDay(Date.parse(job.scheduled_at));return day===publicationDay(now)?'today':day===publicationDay(now+86400000)?'tomorrow':'upcoming';
}
export function groupScheduledJobs(jobs:ScheduledDestination[]){
 const groups=new Map<string,ScheduledDestination[]>();for(const job of jobs){if(['sent','cancelled'].includes(job.state))continue;const key=job.brand_id+':'+job.product_id;groups.set(key,[...groups.get(key)||[],job]);}
 return [...groups.values()].map(rows=>rows.sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at))).sort((a,b)=>Date.parse(a[0].scheduled_at)-Date.parse(b[0].scheduled_at));
}
