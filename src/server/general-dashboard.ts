import type {SupabaseClient} from '@supabase/supabase-js';
import {dbError} from './session';
import {loadCuratedDiscovery} from './shopee/curation';
import {productSchema} from '@/lib/domain';
import {dashboardDistribution,dashboardWeek,readDashboardPages,type DashboardProductState,type DashboardReceipt,type DashboardJob,type GeneralDashboardData} from '@/lib/general-dashboard';
import type {ScheduledDestination} from '@/lib/publication-workspace';
import {isShopeeOperation,isLocalOperation,type OperationScope} from '@/lib/workspace-brands';

export async function loadGeneralDashboard(db:SupabaseClient,owner:string,page:number,now=Date.now(),operation:OperationScope='all'):Promise<GeneralDashboardData>{
 // The caller supplies the authenticated RLS client. No admin client, maintenance,
 // provider calls or write RPCs belong to the general dashboard.
 // RPCs inherit the same operation from sessionDb's x-dropou-brand/RLS context.
 // Explicit filters also constrain every direct table read to owner + operation.
 const scoped=<Columns extends string>(table:string,columns:Columns)=>{const query=db.from(table).select(columns).eq('owner_id',owner);return operation==='all'?query:query.eq('brand_id',operation);};
 const discoveryBrands=operation==='all'?['dropou','celulares','tenis','automoto'] as const:isShopeeOperation(operation)?[operation]:[];
 const [products,publications,jobs,approved,preparedOffers,curated,audit,recent,operationSummary]=await Promise.all([
  readDashboardPages<DashboardProductState>((from,to)=>scoped('products','id,brand_id,curation_state').is('archived_at',null).eq('data->>demo','false').neq('curation_state','rejected').order('id').range(from,to)),
  readDashboardPages<DashboardReceipt>((from,to)=>scoped('dropou_confirmed_publications','id,product_id,brand_id,channel,source,occurred_at').order('brand_id').order('id').range(from,to)),
  readDashboardPages<DashboardJob>((from,to)=>scoped('telegram_jobs','id,product_id,brand_id,channel,state,scheduled_at').in('state',['queued','ready','blocked','failed','sending','partial','uncertain']).order('id').range(from,to)),
  db.rpc('dropou_operational_products',{p_stage:'approved',p_page:page}),
  readDashboardPages<{product_id:string;brand_id:string}>((from,to)=>scoped('offers','product_id,brand_id').eq('status','pronto').order('id').range(from,to)),
  Promise.all(discoveryBrands.map(brand=>loadCuratedDiscovery(db,owner,brand))),
  scoped('operation_audit','id,brand_id,action,created_at').order('created_at',{ascending:false}).limit(5),
  db.rpc('dropou_publication_records_page',{p_page:0}),
  operation!=='all'&&isShopeeOperation(operation)?db.rpc('dropou_operation_summary'):Promise.resolve({data:null,error:null}),
 ]);
 for(const r of [approved,audit,recent,operationSummary])if(r.error)throw dbError(r.error);
 const rows=(approved.data.rows as {id:string;data:unknown}[]).map(r=>productSchema.parse(r.data));
 const upcomingIds=jobs.filter(j=>['queued','ready'].includes(j.state)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at)||a.id.localeCompare(b.id)).slice(0,3).map(j=>j.id);
 const [summaries,upcomingRows]=await Promise.all([rows.length?db.rpc('dropou_product_channel_summaries',{p_ids:rows.map(p=>p.id)}):{data:[],error:null},upcomingIds.length?scoped('telegram_jobs','id,brand_id,product_id,offer_id,channel,state,scheduled_at,destination_title,attempts,message_ids,snapshot').in('id',upcomingIds):{data:[],error:null}]);
 for(const r of [summaries,upcomingRows])if(r.error)throw dbError(r.error);
 const publishedCounts={telegram:publications.filter(r=>r.channel==='telegram'&&r.source==='telegram_receipt').length,whatsapp:publications.filter(r=>r.channel==='whatsapp'&&['whatsapp_manual','manual_mark'].includes(r.source)).length};
 const distribution=dashboardDistribution(products,publications,jobs);
 const activity=[...(audit.data||[]).map(r=>({id:r.id,title:r.action,brand:r.brand_id,at:r.created_at,kind:'operation' as const})),...(recent.data.entries as {id:string;product_name:string;brand_id:string;channel:string;occurred_at:string|null}[]).filter(r=>r.occurred_at).slice(0,5).map(r=>({id:r.id,title:r.channel==='telegram'?'Publicado no Telegram':'WhatsApp confirmado manualmente',brand:r.brand_id,at:r.occurred_at!,kind:'publication' as const}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,5);
 const curation=curated.reduce((n,rows)=>n+rows.length,0)+products.filter(p=>(['bruto','moda'].includes(p.brand_id)||isLocalOperation(p.brand_id))&&p.curation_state==='pending').length;
 const active=new Set(products.map(p=>p.brand_id+':'+p.id));
 const busyOrPublished=new Set([...publications,...jobs].map(r=>r.channel+':'+r.brand_id+':'+r.product_id));
 const prepared=(channel:string)=>new Set(preparedOffers.filter(o=>active.has(o.brand_id+':'+o.product_id)&&!busyOrPublished.has(channel+':'+o.brand_id+':'+o.product_id)).map(o=>o.brand_id+':'+o.product_id)).size;
 const upcoming=upcomingIds.flatMap(id=>{const j=upcomingRows.data?.find(r=>r.id===id);return j?[{...j,name:j.snapshot.name,data:productSchema.parse(j.snapshot)} as ScheduledDestination]:[];});
 return {serverNow:new Date(now).toISOString(),...(operationSummary.data?{operationSummary:{recent:operationSummary.data.recent,catalog:operationSummary.data.published}}:{}),stats:{approved:approved.data.total,curation,publications:publishedCounts.telegram+publishedCounts.whatsapp,scheduled:jobs.filter(j=>['queued','ready'].includes(j.state)).length},distribution,weekly:dashboardWeek(publications,now),
  channels:Object.fromEntries((['telegram','whatsapp'] as const).map(c=>[c,{publications:publishedCounts[c],prepared:prepared(c),scheduled:jobs.filter(j=>j.channel===c&&['queued','ready'].includes(j.state)).length}])) as GeneralDashboardData['channels'],
  products:rows,productTotal:approved.data.total,page,more:approved.data.total>(page+1)*24,productChannels:Object.fromEntries((summaries.data||[]).map((r:any)=>[r.product_id,{telegram:r.telegram,whatsapp:r.whatsapp}])),
  upcoming,attention:jobs.filter(j=>['blocked','failed','partial','uncertain'].includes(j.state)||['queued','ready'].includes(j.state)&&Date.parse(j.scheduled_at)<now).length,activity};
}
