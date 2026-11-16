import type {Product} from './domain';
import type {ProductChannelSummary,Channel} from './channel-state';
import type {ScheduledDestination} from './publication-workspace';
import {publicationDay} from './publication-workspace';

export type DashboardProductState={id:string;brand_id:string;curation_state:string};
export type DashboardReceipt={id:string;product_id:string;brand_id:string;channel:Channel;source:string;occurred_at:string|null};
export type DashboardJob={id:string;product_id:string;brand_id:string;channel:Channel;state:string;scheduled_at:string};
export type DashboardActivity={id:string;title:string;brand:string;at:string;kind:'publication'|'operation'};
export type DistributionKey='published'|'waiting'|'scheduled'|'curation';
export type GeneralDashboardData={
 serverNow:string;
 stats:{approved:number;curation:number;publications:number;scheduled:number};
 distribution:{key:DistributionKey;label:string;value:number}[];
 weekly:{day:string;telegram:number;whatsapp:number}[];
 channels:Record<Channel,{publications:number;prepared:number;scheduled:number}>;
 products:Product[];productTotal:number;page:number;more:boolean;
 productChannels:Record<string,ProductChannelSummary>;
 upcoming:ScheduledDestination[];attention:number;activity:DashboardActivity[];
};

/** Registered products occupy one stage only. Reposts never duplicate a product. */
export function dashboardDistribution(products:DashboardProductState[],receipts:Pick<DashboardReceipt,'product_id'|'brand_id'>[],jobs:DashboardJob[]){
 const key=(r:{product_id:string;brand_id:string})=>r.brand_id+':'+r.product_id;
 const published=new Set(receipts.map(key));
 const scheduled=new Set(jobs.filter(j=>j.state==='queued'||j.state==='ready').map(key));
 const values={published:0,waiting:0,scheduled:0,curation:0};
 for(const p of products){if(p.curation_state==='rejected')continue;const id=p.brand_id+':'+p.id;
  if(published.has(id))values.published++;
  else if(scheduled.has(id))values.scheduled++;
  else if(p.curation_state==='approved')values.waiting++;
  else values.curation++;
 }
 return ([['published','Publicadas'],['waiting','Aguardando publicação'],['scheduled','Agendadas'],['curation','Em curadoria']] as const).map(([key,label])=>({key,label,value:values[key]}));
}

/** Only confirmed receipts enter the chart; copying/preparing has no receipt. */
export function dashboardWeek(receipts:DashboardReceipt[],now=Date.now()){
 const today=publicationDay(now),start=Date.parse(today+'T12:00:00Z')-6*86400000;
 const days=Array.from({length:7},(_,i)=>({day:new Date(start+i*86400000).toISOString().slice(0,10),telegram:0,whatsapp:0}));
 const seen=new Set<string>();
 for(const r of receipts){const key=r.brand_id+':'+r.channel+':'+r.source+':'+r.id;if(seen.has(key)||!r.occurred_at||!Number.isFinite(Date.parse(r.occurred_at)))continue;seen.add(key);
  if(r.channel==='telegram'&&r.source!=='telegram_receipt'||r.channel==='whatsapp'&&!['whatsapp_manual','manual_mark'].includes(r.source))continue;
  const occurredAt=r.occurred_at,day=days.find(d=>d.day===publicationDay(Date.parse(occurredAt)));if(day)day[r.channel]++;
 }
 return days;
}

export async function readDashboardPages<T>(read:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>):Promise<T[]>{
 const rows:T[]=[];
 // Bounded work; never present a truncated scan as an exact metric.
 for(let page=0;page<100;page++){const r=await read(page*500,page*500+499);if(r.error)throw new Error('Não foi possível carregar o resumo completo.');const batch=r.data||[];rows.push(...batch);if(batch.length<500)return rows;}
 throw new Error('O volume do resumo excedeu o limite de leitura. Abra os relatórios por operação.');
}
