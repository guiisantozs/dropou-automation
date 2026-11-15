// Local visual fixtures from the real components. No backend or provider calls.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {CalendarClock,History,LayoutDashboard} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import PublicationSchedule from '../src/components/publication-schedule';
import PublicationsWorkspace from '../src/components/publications-workspace';
import {emptyProduct} from '../src/lib/product-draft';
import type {SchedulePage,ScheduledDestination,RecordsPage,PublishedRecord} from '../src/lib/publication-workspace';
const css=['globals.css','workspace.css','premium.css','publication-workspace.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n');
const now=Date.now(),stamp=new Date(now).toISOString(),at=(hours:number)=>new Date(now+hours*3600000).toISOString();
const product={...emptyProduct(),name:'Controle DualSense sem fio para PlayStation 5 e PC',price:349.9,image:''};
const job:ScheduledDestination={id:crypto.randomUUID(),product_id:product.id,offer_id:crypto.randomUUID(),brand_id:'dropou',channel:'telegram',state:'queued',scheduled_at:at(1),destination_title:'Tech & Games',attempts:0,message_ids:[],name:product.name,data:product};
const jobs:ScheduledDestination[]=[job,{...job,id:crypto.randomUUID(),channel:'whatsapp',destination_title:'Grupo Tech & Games'},
 {...job,id:crypto.randomUUID(),product_id:crypto.randomUUID(),brand_id:'celulares',name:'Carregador USB-C com duas portas',data:{...product,name:'Carregador USB-C com duas portas',price:79.9},scheduled_at:at(24),destination_title:'Celulares & Gadgets'},
 {...job,id:crypto.randomUUID(),product_id:crypto.randomUUID(),name:'Mouse Logitech G305 sem fio',data:{...product,name:'Mouse Logitech G305 sem fio',price:189.9},state:'failed',scheduled_at:at(-1),error:'O destino não confirmou a publicação. Confira antes de tentar novamente.'}];
const schedule:SchedulePage={jobs,channels:{},total:3,more:false,serverNow:stamp,summary:{today:3,pending:4,attention:1,next:at(1)}};
const entry:PublishedRecord={id:crypto.randomUUID(),product_id:product.id,brand_id:'dropou',product_name:product.name,channel:'telegram',status:'sent',occurred_at:at(-2),recorded_at:at(-2),scheduled_at:at(-2),destination:'Tech & Games',destination_id:null,message_ids:['12'],confirmed_by:null,is_republication:false,publication_round:crypto.randomUUID(),error:null,review_required:false,source:'telegram_receipt',snapshot:product,actor_id:null,actor_name:'Administrador'};
const records:RecordsPage={entries:[entry,{...entry,id:crypto.randomUUID(),channel:'whatsapp',source:'manual_mark',destination:'Grupo Tech & Games',message_ids:[],occurred_at:at(-1),actor_name:'Operador · 0012'}],total:2,more:false,serverNow:stamp,allowedBrands:['dropou','celulares','tenis','automoto'],admin:true,operators:[{id:crypto.randomUUID(),label:'Administrador'}]};
mkdirSync('outputs/premium-review',{recursive:true});
for(const [name,title,content]of [
 ['scheduling','Agendamentos',h(PublicationSchedule,{operation:'all',initialData:schedule})],
 ['publications','Publicações',h(PublicationsWorkspace,{operation:'all',initialData:records})],
] as const){
 const sidebar=h(WorkspaceSidebar,{brand:'dropou',active:title,items:[{id:'Dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'Agendamentos',label:'Agendamentos',icon:CalendarClock},{id:'Publicações',label:'Publicações',icon:History}],onBrand(){},onNavigate(){},onCreate(){},onHelp(){}});
 writeFileSync('outputs/premium-review/'+name+'.html','<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderToStaticMarkup(h('div',{className:'app-shell'},sidebar,h('div',{className:'main-shell'},h('main',{className:'content'},h('div',{className:'page-heading'},h('h1',null,title)),content))))+'</body></html>');
}
console.log('Scheduling and publication fixtures generated.');
