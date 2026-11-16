// Real components, synthetic products, no credentials or API requests.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {LayoutDashboard,Search,ShieldCheck,BookmarkPlus,Zap,Package,ListOrdered,Clock3,Link2,Clipboard,Sparkles} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import WorkspacePageHeader from '../src/components/workspace-page-header';
import {GeneralDashboardView} from '../src/components/general-dashboard';
import {workspaceBrands,isShopeeOperation} from '../src/lib/workspace-brands';
import {generalFixture} from './review-general-dashboard';
const noop=()=>{};
const css=['workspace.css','premium.css','publication-workspace.css','operation-theme.css','refined-workspace.css','general-dashboard.css','general-dashboard-polish.css','shopee-library.css','operational-workspace.css','operation-dashboard.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n');
const items=[['Visão geral','Dashboard',LayoutDashboard],['Curadoria','Curadoria',ShieldCheck],['Buscar ofertas','Buscar ofertas',Search],['Meus links Shopee','Meus links Shopee',BookmarkPlus],['Automação de Ofertas','Busca e consumo',Zap],['Catálogo de produtos','Catálogo',Package],['Fila de ofertas','Publicações',ListOrdered],['Agendamento','Agendamentos',Clock3],['Integrações','Configurações',Link2],['Logs de atividade','Logs de atividade',Clipboard],['Consumo de IA','Legendas e IA',Sparkles]] as const;
mkdirSync('outputs/operation-dashboard-review',{recursive:true});
for(const {id:operation} of workspaceBrands.filter(b=>b.id!=='all')){
 const products=generalFixture.products.filter(p=>p.operation===operation);
 const fixture={...generalFixture,operationSummary:isShopeeOperation(operation)?{recent:7,catalog:30}:undefined,products,productTotal:products.length,stats:{...generalFixture.stats,approved:products.length},upcoming:generalFixture.upcoming.filter(j=>j.brand_id===operation),activity:generalFixture.activity.filter(a=>a.brand===operation)};
 for(const empty of [false,true]){
  const data=empty?{...fixture,products:[],productTotal:0,stats:{approved:0,curation:0,publications:0,scheduled:0},operationSummary:fixture.operationSummary?{recent:0,catalog:0}:undefined,distribution:fixture.distribution.map(s=>({...s,value:0})),weekly:fixture.weekly.map(d=>({...d,telegram:0,whatsapp:0})),upcoming:[],activity:[]}:fixture;
  const markup=renderToStaticMarkup(h('div',{className:'app-shell operational-workspace operation-dashboard-shell','data-operation':operation},h(WorkspaceSidebar,{light:true,brand:operation,active:'Visão geral',items:items.filter(([id])=>id!=='Curadoria'||isShopeeOperation(operation)).map(([id,label,icon])=>({id,label,icon})),onBrand:noop,onNavigate:noop,onCreate:noop,onHelp:noop}),h('div',{className:'main-shell'},h(WorkspacePageHeader,{view:'Visão geral',operation,onCreate:noop,onSearch:noop,onActivity:noop,onSettings:noop}),h('main',{className:'content'},h('div',{className:'dashboard-scope operation-dashboard'},h(GeneralDashboardView,{data,onRefresh:noop,onNavigate:noop,onCreate:noop,onMessage:noop})),h('footer',{className:'page-footer'},h('span',null,'PRÉVIA VISUAL · DADOS DEMONSTRATIVOS'),h('a',{href:'/?brand=dropou'},'Tech & Games'),h('a',{href:'/?brand=celulares'},'Celulares & Gadgets'),h('a',{href:'/?brand=all'},'Todas as operações'))))));
  writeFileSync(`outputs/operation-dashboard-review/${operation}${empty?'-empty':''}.html`,'<!doctype html><html lang="pt-BR" data-operation="'+operation+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropou · prévia por operação</title><style>'+css+'</style></head><body>'+markup+'<script>document.addEventListener("click",e=>{const a=e.target.closest("a");if(a&&!a.getAttribute("href").startsWith("/?brand="))e.preventDefault();});</script></body></html>');
 }
 writeFileSync(`outputs/operation-dashboard-review/${operation}.json`,JSON.stringify(fixture));
}
console.log('Operation dashboard previews generated.');
