// Local visual fixtures; no accounts, provider requests or application backend.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {LayoutDashboard,BookmarkPlus,Package} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';
import ShopeeSavedProducts from '../src/components/shopee-saved-products';
import ProductOperations from '../src/components/product-operations';
const css=['globals.css','workspace.css','premium.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n'),stamp=new Date().toISOString();
const saved={id:crypto.randomUUID(),input_url:'https://shopee.com.br/product/123/456',canonical_url:'https://shopee.com.br/product/123/456',data:null,state:'error' as const,error:'Consulta indisponível. O link continua salvo.',prepared_product_id:null,created_at:stamp,updated_at:stamp};
const savedData={products:[saved,{...saved,id:crypto.randomUUID(),error:'Limite de consultas atingido. Tente novamente depois.'}],total:2,more:false,credentialsReady:true,budget:{used:0,limit:200,globalUsed:0,globalLimit:200}};
const catalogData={rows:[{id:saved.id,kind:'saved' as const,data:{name:'Produto aguardando consulta',store:'Shopee',originalUrl:saved.input_url},saved_state:'error',saved_error:saved.error,catalog_at:stamp},{id:crypto.randomUUID(),kind:'product' as const,data:{name:'Controle Bluetooth para PC · fixture visual',store:'Shopee',price:149.9,image:''},catalog_at:stamp}],total:2,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}};
mkdirSync('outputs/premium-review',{recursive:true});
for(const [name,title,content]of [
 ['savedretention','Meus produtos salvos',h(ShopeeSavedProducts,{operation:'dropou',initialData:savedData,onOpen(){}})],
 ['catalogretention','Catálogo',h(ProductOperations,{operation:'dropou',mode:'catalog',initialData:catalogData,onOpen(){},onNavigate(){}})],
] as const){
 const sidebar=h(WorkspaceSidebar,{brand:'dropou',active:title,items:[{id:'Dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'Meus produtos salvos',label:'Meus produtos salvos',icon:BookmarkPlus},{id:'Catálogo',label:'Catálogo',icon:Package}],onBrand(){},onNavigate(){},onCreate(){},onHelp(){}});
 const html='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderToStaticMarkup(h('div',{className:'app-shell'},sidebar,h('div',{className:'main-shell'},h('main',{className:'content'},h('div',{className:'page-heading'},h('h1',null,title)),content))))+'</body></html>';
 writeFileSync('outputs/premium-review/'+name+'.html',html);
}
console.log('Saved retention and catalog fixtures generated.');
