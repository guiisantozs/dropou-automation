import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {LayoutDashboard,Package,Plus,Send,Clock3,Settings,Clipboard,Search,ArrowUpRight} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import {BrandPreparation} from '../src/components/brand-selector';
import DashboardOverview from '../src/components/dashboard-overview';
import ProductCatalog from '../src/components/product-catalog';
import ProductForm from '../src/components/product-form';
import {emptyProduct} from '../src/lib/product-draft';

globalThis.fetch=async()=>{throw new Error('Static design review cannot access a network');};
const noop=()=>{};
const sections=[
 ['inicio','Dashboard',h(DashboardOverview,{products:[],publications:[],offers:[],overview:true,onCreate:noop,onOpen:noop,onPreview:noop,onImport:noop,onNavigate:noop})],
 ['catalogo','Catálogo de produtos',h(ProductCatalog,{products:[],onCreate:noop,onOpen:noop,onPreview:noop,onImport:noop})],
 ['cadastro','Cadastro de oferta',h(ProductForm,{product:emptyProduct(),page:true,onClose:noop,onSave:async()=>{}})],
 ['operacoes','Operações em preparação',h('div',null,h(BrandPreparation,{brand:'bruto',onReturn:noop}),h(BrandPreparation,{brand:'moda',onReturn:noop}))],
] as const;
const items=[{id:'inicio',label:'Dashboard',icon:LayoutDashboard},{id:'catalogo',label:'Catálogo de produtos',icon:Package},{id:'cadastro',label:'Cadastro de oferta',icon:Plus},{id:'inicio',label:'Publicações',icon:Send},{id:'inicio',label:'Agendamentos',icon:Clock3},{id:'inicio',label:'Histórico',icon:Clipboard},{id:'operacoes',label:'Configurações',icon:Settings}].map((item,i)=>({...item,id:item.id+'-'+i}));
const sidebar=h(WorkspaceSidebar,{items,active:'inicio-0',brand:'dropou',onBrand:noop,onNavigate:noop,onCreate:noop,onHelp:noop,onSignOut:noop});
const content=h('div',{className:'main-shell'},h('header',{className:'topbar'},h('a',{className:'topbar-search',href:'#catalogo'},h(Search,{size:19}),h('span',null,'Buscar produtos no catálogo…'),h(ArrowUpRight,{size:15})),h('div',{className:'topbar-right'},h('span',{className:'mode-pill'},'Prévia local'),h('span',{className:'avatar'},'DP'))),h('main',{className:'content'},h('p',{className:'review-context'},'PRÉVIA LOCAL · Estado vazio, sem conexão com sua conta. Controles de operação desativados.'),...sections.map(([id,title,component])=>h('section',{key:id,id,style:{marginBottom:56,scrollMarginTop:24}},h('div',{className:'page-heading'},h('div',null,h('div',{className:'eyebrow'},'DROPOU · GAMES & TECNOLOGIA'),h('h1',null,title))),component))));
const css=readFileSync('src/app/workspace.css','utf8'),markup=renderToStaticMarkup(h('div',{className:'app-shell'},sidebar,content)),{JSDOM}=createRequire(import.meta.url)('jsdom');
const reviewCss='.review-context{font-size:10px;color:var(--ink-muted);margin:0 0 20px}[data-review-control]{opacity:1!important;cursor:default}';
const doc=new JSDOM('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropou · nova referência visual</title><style>'+css+reviewCss+'</style></head><body>'+markup+'</body></html>');
const page=doc.window.document;
for(const control of page.querySelectorAll('button,input,textarea,select')){if(!control.hasAttribute('disabled'))control.setAttribute('data-review-control','');control.setAttribute('disabled','');control.setAttribute('title','Prévia estática; ação desativada');}
// Only section navigation works in this offline artifact. Operational controls remain disabled.
for(const [i,button] of [...page.querySelectorAll('.sidebar-links>button')].entries()){const target=['inicio','catalogo','cadastro','inicio','inicio','inicio','operacoes','cadastro'][i];if(!target)continue;const a=page.createElement('a');a.className=button.className;a.innerHTML=button.innerHTML;a.href='#'+target;button.replaceWith(a);}
for(const a of page.querySelectorAll('a'))if(!a.getAttribute('href')?.startsWith('#')){a.removeAttribute('href');a.removeAttribute('target');}
for(const [index,heading]of [...page.querySelectorAll('#brand-preparation-title')].entries()){heading.id='review-brand-'+index;heading.closest('section')?.setAttribute('aria-labelledby',heading.id);}
mkdirSync('docs/review',{recursive:true});writeFileSync('docs/review/redesign.html',doc.serialize());doc.window.close();console.log('docs/review/redesign.html · offline, empty states, no external calls');
