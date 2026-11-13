// Isolated visual fixtures. No environment credentials or external API requests.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement as h,act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {BookmarkPlus,LayoutDashboard,Search,Zap,Package,Clock3,Link2,ListOrdered,History} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import DashboardOverview from '../src/components/dashboard-overview';
import OfferAutomation from '../src/components/offer-automation';
import NextPosts from '../src/components/next-posts';
import PublicationSchedule from '../src/components/publication-schedule';
import OfferPreview from '../src/components/offer-preview';
import PublicationActions from '../src/components/publication-actions';
import ShopeeSavedProducts from '../src/components/shopee-saved-products';
import {PublicationHistoryRow} from '../src/components/publication-history';
import {defaultShopeeConfig} from '../src/lib/shopee-automation';
import {shopeeProduct} from '../src/lib/shopee-product';
import {safePublicationCaption,pricedDraftCaption} from '../src/lib/publication-copy';
import type {api} from '../src/lib/api';
import type {Offer} from '../src/lib/offers';
import type {WorkspaceBrandId} from '../src/lib/workspace-brands';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),noop=()=>{},now=new Date(),css=readFileSync('src/app/workspace.css','utf8')+readFileSync('src/app/premium.css','utf8');
const names=['Dashboard','Automação de Ofertas','Meus links Shopee','Próximos posts','Catálogo','Agendamentos','Histórico','Configurações'],icons=[LayoutDashboard,Zap,BookmarkPlus,Clock3,Package,Clock3,History,Link2];
const source={itemId:'9001',shopId:'8001',name:'Controle Bluetooth para PC e console · exemplo visual',price:180,priceMax:180,image:'',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/8001/9001',rating:4.8,sales:2820,commission:.1,reportedDiscount:20,checkedAt:now.toISOString()};
const products=['Controle Bluetooth para PC e console','SSD NVMe 1 TB · armazenamento','Headset gamer com microfone'].map((name,i)=>({...shopeeProduct({...source,name,itemId:String(9001+i)}),shortName:name,price:[180,329.9,149.9][i]}));
const offers=products.map(p=>({id:crypto.randomUUID(),product_id:p.id,snapshot:p,caption:safePublicationCaption(p),status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt})) as Offer[];
const candidates=products.map((p,i)=>({id:crypto.randomUUID(),data:{...source,name:p.name,price:p.price,priceMax:p.price,itemId:String(9001+i)},eligible:true,score:82-i*7,reasons:[],decision:'approved',prepared_product_id:p.id}));
const automation={config:defaultShopeeConfig(),offers:candidates,requests:[],runs:[],jobs:[],day:now.toISOString().slice(0,10),globalUsed:0,globalLimit:10,dispatcherEnabled:false,operationEnabled:false,destination:'Canal de exemplo · fixture',verified:true,credentialsReady:false,liveReleased:false,testReady:false};
function wrap(title:string,body:string,brand:WorkspaceBrandId='dropou'){
 const sidebar=renderToStaticMarkup(h(WorkspaceSidebar,{brand,active:title,items:names.map((id,i)=>({id,label:id,icon:icons[i]})),onBrand:noop,onNavigate:noop,onCreate:noop,onHelp:noop}));
 const doc=new JSDOM('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropou · prévia isolada</title><style>'+css+'</style></head><body><div class="app-shell" data-operation="'+brand+'">'+sidebar+'<div class="main-shell"><header class="topbar"><button class="topbar-search">Buscar no catálogo…</button><span class="mode-pill">PRÉVIA · DADOS FICTÍCIOS</span></header><main class="content"><div class="page-heading"><div><span class="eyebrow">DROPOU AUTOMAÇÃO</span><h1>'+title+'</h1><p>Revisão visual com fixtures. Nenhuma ação altera o sistema.</p></div><button class="primary">+ Criar nova oferta</button></div>'+body+'</main></div></div></body></html>');
 for(const link of doc.window.document.querySelectorAll('a')){link.removeAttribute('href');link.removeAttribute('target');}return doc.serialize();
}
async function mounted(element:React.ReactNode){const dom=new JSDOM('<div id="fixture"></div>',{url:'http://127.0.0.1/'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [k,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value,writable:true,configurable:true});}const root=createRoot(document.getElementById('fixture')!);try{await act(async()=>root.render(element));return document.getElementById('fixture')!.innerHTML;}finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else Reflect.deleteProperty(globalThis,k);}}}
const out='outputs/premium-review';mkdirSync(out,{recursive:true});
for(const brand of ['dropou','bruto','moda'] as const){const markup=renderToStaticMarkup(h(DashboardOverview,{operation:brand,products:products.map(p=>({...p,operation:brand})),offers,publications:[],overview:true,summary:{products:3,published:2,scheduled:1,waiting:1},curation:brand==='dropou'?{pending:4,approved:3,rejected:2}:null,automation:false,onCreate:noop,onOpen:noop,onPreview:noop,onImport:noop,onNavigate:noop}));writeFileSync(out+'/'+brand+'.html',wrap('Dashboard',markup,brand));}
writeFileSync(out+'/automation.html',wrap('Automação de Ofertas',renderToStaticMarkup(h(OfferAutomation,{operation:'dropou',initialData:automation}))));
writeFileSync(out+'/catalog.html',wrap('Catálogo',renderToStaticMarkup(h(DashboardOverview,{products,offers,publications:[],overview:false,onCreate:noop,onOpen:noop,onPreview:noop,onImport:noop,onNavigate:noop}))));
const request=(async()=>automation) as typeof api;
writeFileSync(out+'/posts.html',wrap('Próximos posts',await mounted(h(NextPosts,{operation:'dropou',products,offers,request,onOpen:noop}))));
const jobs=['queued','queued','blocked','sent'].map((state,i)=>({id:crypto.randomUUID(),offer_id:offers[0].id,product_id:products[i%3].id,name:products[i%3].name,brand_id:'dropou',channel:'telegram',state,scheduled_at:new Date(Date.now()+[3600000,86400000,-3600000,-86400000][i]).toISOString(),destination_title:'Canal de exemplo',attempts:0,message_ids:[]}));
const scheduleRequest=(async(path:string)=>path.includes('publication-config')?{enabled:false,telegram:{available:false}}:{jobs,more:false}) as typeof api;
writeFileSync(out+'/schedule.html',wrap('Agendamentos',await mounted(h(PublicationSchedule,{request:scheduleRequest}))));
const history=renderToStaticMarkup(h(PublicationHistoryRow,{showProduct:true,entry:{id:'fixture',product_id:products[0].id,product_name:products[0].name,channel:'telegram',status:'sent',occurred_at:now.toISOString(),recorded_at:now.toISOString(),scheduled_at:now.toISOString(),destination:'Canal de exemplo',destination_id:'-100123',message_ids:['18'],confirmed_by:null,is_republication:false,publication_round:null,error:null,review_required:false}}));
writeFileSync(out+'/history.html',wrap('Histórico','<section class="catalog"><div class="catalog-heading"><h2>Publicações recentes</h2></div>'+history+'</section>'));
writeFileSync(out+'/offer.html',wrap('Prévia da publicação',renderToStaticMarkup(h(OfferPreview,{product:products[0],offer:offers[0],page:true,onClose:noop,onRefresh:async()=>{},onEdit:noop}))));
writeFileSync(out+'/empty.html',wrap('Automação de Ofertas',renderToStaticMarkup(h(OfferAutomation,{operation:'dropou',initialData:{...automation,offers:[]}}))));
const verificationRequest=(async()=>({enabled:false,telegram:{available:false,id:'-100123',title:'Canal de exemplo',reason:'O canal está salvo, mas a permissão do bot ainda precisa ser verificada.'}})) as typeof api;
writeFileSync(out+'/verification.html',wrap('Agendamentos',await mounted(h(PublicationActions,{product:products[0],offer:offers[0],text:offers[0].caption,initialAction:'schedule',request:verificationRequest,save:async()=>offers[0],onUpdate:async()=>{},onEdit:noop}))));
const quickRequest=(async()=>({enabled:false,slots:['09:00','12:30','16:30','20:30'],serverNow:now.toISOString(),telegram:{available:true,id:'-100123',title:'Canal fixture',key:'a'.repeat(64)}})) as typeof api;
const quickOffer={...offers[0],caption:pricedDraftCaption(products[0])};
writeFileSync(out+'/quickschedule.html',wrap('Agendamento rápido',await mounted(h(PublicationActions,{product:products[0],offer:quickOffer,text:quickOffer.caption,initialAction:'schedule',preference:'priced',request:quickRequest,save:async()=>quickOffer,onUpdate:async()=>{},onEdit:noop}))));
console.log('Isolated fixture previews: '+out);
const photo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="300" viewBox="0 0 440 300"><rect width="440" height="300" fill="#eceef0"/><rect x="80" y="80" width="280" height="140" rx="55" fill="#313945"/><path d="M135 125v50m-25-25h50" stroke="#bbc5d1" stroke-width="12"/><circle cx="293" cy="135" r="10" fill="#ff6a1a"/><circle cx="320" cy="160" r="10" fill="#8291a5"/><text x="220" y="265" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#515d6c">Imagem de fixture</text></svg>').toString('base64');
const savedRows=products.map((p,i)=>({id:p.id,input_url:p.originalUrl,canonical_url:p.originalUrl,data:i<2?{...source,name:p.name,image:photo,price:p.price,priceMax:i?p.price+100:p.price}:null,state:i<2?'ready' as const:'error' as const,error:i===2?'A consulta ficou pendente. O link continua salvo.':null,prepared_product_id:null,created_at:p.createdAt,updated_at:p.createdAt}));
writeFileSync(out+'/saved.html',wrap('Meus links Shopee',renderToStaticMarkup(h(ShopeeSavedProducts,{operation:'dropou',initialData:{products:savedRows,total:3,more:false,credentialsReady:true,budget:{used:3,limit:8,globalUsed:3,globalLimit:10}},onOpen:noop}))));
