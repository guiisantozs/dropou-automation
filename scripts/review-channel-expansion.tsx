// Local visual fixtures only: no credentials, provider calls or application backend.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {LayoutDashboard,Search,BookmarkPlus,Package,Clock3,History,Link2} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import ProductOperations from '../src/components/product-operations';
import ShopeeSavedProducts from '../src/components/shopee-saved-products';
import {operationName} from '../src/lib/workspace-brands';
const css=['globals.css','workspace.css','premium.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n');
const nav=['Dashboard','Curadoria','Adicionar por link','Catálogo','Agendamentos','Histórico','Configurações'],icons=[LayoutDashboard,Search,BookmarkPlus,Package,Clock3,History,Link2];
mkdirSync('outputs/premium-review',{recursive:true});
for(const [brand,name,price]of [['celulares','Smartphone Samsung · fixture visual',1199],['tenis','Tênis Olympikus · fixture visual',179.9],['automoto','Carregador veicular USB · fixture visual',49.9]] as const){
 const sidebar=h(WorkspaceSidebar,{brand,active:'Curadoria',items:nav.map((id,i)=>({id,label:id,icon:icons[i]})),onBrand(){},onNavigate(){},onCreate(){},onHelp(){}});
 const data={rows:[{id:'10000000-0000-4000-8000-000000000001',kind:'cache' as const,data:{name,price,image:'',offerLink:'https://s.shopee.com.br/fixture'},eligible:true,reasons:[],score:85}],total:1,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:1,approved:0,published:0,recent:0,archived:0}};
 const content=h(ProductOperations,{operation:brand,mode:'curation',initialData:data,onOpen(){},onNavigate(){}});
 const html='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderToStaticMarkup(h('div',{className:'app-shell'},sidebar,h('div',{className:'main-shell'},h('main',{className:'content'},h('div',{className:'page-heading'},h('div',null,h('div',{className:'eyebrow'},operationName(brand)),h('h1',null,'Curadoria'),h('p',null,'Fixture de revisão local · sem publicação real'))),content))))+'</body></html>';
 writeFileSync('outputs/premium-review/'+brand+'.html',html);
}
console.log('Three local channel previews generated.');
