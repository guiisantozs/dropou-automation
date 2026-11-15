// Real components with fixtures, without accounts, provider calls or writes.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {LayoutDashboard,ShieldCheck,Search,BookmarkPlus,Package,History,CalendarClock,Link2} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import CelularesHero from '../src/components/celulares-hero';
import ProductOperations from '../src/components/product-operations';
import ShopeeSavedProducts from '../src/components/shopee-saved-products';
import ShopeeTools from '../src/components/shopee-tools';
import PublicationSchedule from '../src/components/publication-schedule';
import PublicationsWorkspace from '../src/components/publications-workspace';
import OfferPreview from '../src/components/offer-preview';
import AIUsage from '../src/components/ai-usage';
import {emptyProduct} from '../src/lib/product-draft';
import type {OperationsData} from '../src/components/product-operations';
const css=['globals.css','workspace.css','premium.css','publication-workspace.css','operation-theme.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n'),stamp=new Date().toISOString();
const product={...emptyProduct(),operation:'celulares' as const,store:'Shopee' as const,name:'Smartphone Samsung Galaxy A55 128 GB',niche:'Smartphones',price:1499.9,inStock:true,checkedAt:stamp,affiliateUrl:'https://shopee.com.br/product/123/456',image:''};
const rows=[{id:product.id,kind:'product' as const,data:product}];
const data:OperationsData={rows,total:1,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:3,approved:1,published:2,recent:0,archived:0}};
const offer={id:crypto.randomUUID(),product_id:product.id,snapshot:product,caption:'📱 SMARTPHONE PARA O SEU DIA\n\nSamsung Galaxy A55 128 GB\nR$ 1.499,90\n\nConfira na loja 👇\n'+product.affiliateUrl+'\n\n#publi | Dropou Celulares & Gadgets',status:'pronto' as const,created_at:stamp,updated_at:stamp};
const pages=[
 ['celularesdashboard','Dashboard',h('div',null,h(CelularesHero),h(ProductOperations,{operation:'celulares',initialData:data,onOpen(){},onNavigate(){}}))],
 ['celularescuration','Curadoria',h(ProductOperations,{operation:'celulares',mode:'curation',initialData:{...data,rows:[]},onOpen(){},onNavigate(){}})],
 ['celularessearch','Buscar ofertas',h(ShopeeTools,{operation:'celulares',onCurated(){}})],
 ['celularessaved','Meus links Shopee',h(ShopeeSavedProducts,{operation:'celulares',initialData:{products:[],total:0,more:false,credentialsReady:true,budget:{used:0,limit:200,globalUsed:0,globalLimit:200}},onOpen(){}})],
 ['celularesschedule','Agendamentos',h(PublicationSchedule,{operation:'celulares',initialData:{jobs:[],channels:{},total:0,more:false,serverNow:stamp,summary:{today:0,pending:0,attention:0,next:null}}})],
 ['celularespublications','Publicações',h(PublicationsWorkspace,{operation:'celulares',initialData:{entries:[],total:0,more:false,serverNow:stamp,allowedBrands:['dropou','celulares','tenis','automoto'],admin:true,operators:[]}})],
 ['celularescaptions','Legendas e IA',h(AIUsage,{operation:'celulares',products:[product],onRefresh:async()=>{}})],
 ['celularesoffer','Oferta',h(OfferPreview,{product,offer,page:true,onRefresh:async()=>{},onClose(){},onEdit(){}})],
] as const;
mkdirSync('outputs/premium-review',{recursive:true});
for(const [name,title,content]of pages){
 const sidebar=h(WorkspaceSidebar,{brand:'celulares',active:title,items:[{id:'Dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'Curadoria',label:'Curadoria',icon:ShieldCheck},{id:'Buscar ofertas',label:'Buscar ofertas',icon:Search},{id:'Meus links Shopee',label:'Meus links Shopee',icon:BookmarkPlus},{id:'Catálogo',label:'Catálogo',icon:Package},{id:'Publicações',label:'Publicações',icon:History},{id:'Agendamentos',label:'Agendamentos',icon:CalendarClock},{id:'Configurações',label:'Configurações',icon:Link2}],onBrand(){},onNavigate(){},onCreate(){},onHelp(){}});
 const app=h('div',{className:'app-shell','data-operation':'celulares'},sidebar,h('div',{className:'main-shell'},h('header',{className:'topbar'},h('button',{className:'topbar-search'},h(Search,{size:19}),h('span',null,'Buscar produtos no catálogo…')),h('div',{className:'topbar-right'},h('span',{className:'current-operation'},'Dropou | Celulares & Gadgets'),h('span',{className:'mode-pill'},h('span'),'Supabase conectado'),h('button',{'aria-label':'Ver logs'},h(History,{size:19})),h('span',{className:'avatar'},'DP'))),h('main',{className:'content'},h('div',{className:'page-heading'},h('div',null,h('span',{className:'eyebrow'},'DROPOU | CELULARES & GADGETS'),h('h1',null,title))),content)));
 const mascot='data:image/png;base64,'+readFileSync('public/images/celulares-mascot.png').toString('base64');
 writeFileSync('outputs/premium-review/'+name+'.html',('<!doctype html><html lang="pt-BR" data-operation="celulares"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+renderToStaticMarkup(app)+'</body></html>').replaceAll('/images/celulares-mascot.png',mascot));
}
const control=h('main',{className:'content','data-operation':'dropou'},h('h1',null,'Tech & Games'),h(ProductOperations,{operation:'dropou',initialData:{...data,rows:[]},onOpen(){},onNavigate(){}}));
writeFileSync('outputs/premium-review/techcontrol.html','<!doctype html><html lang="pt-BR" data-operation="dropou"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+renderToStaticMarkup(control)+'</body></html>');
console.log('Eight Celulares fixtures plus the unchanged Tech theme control generated.');
