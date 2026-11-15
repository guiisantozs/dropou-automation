// Local component fixtures only. Never fetches product data or posts an offer.
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ProductForm from '../src/components/product-form';
import {emptyProduct} from '../src/lib/product-draft';
import {importMercadoLivreData} from '../src/server/mercado-livre/import-core';
const original='https://produto.mercadolivre.com.br/MLB-3574638387-capa-de-celular-_JM';
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect x="45" y="10" width="90" height="160" rx="16" fill="#d5dce1"/><rect x="50" y="15" width="80" height="150" rx="13" fill="#262e34"/><circle cx="68" cy="35" r="9" fill="#9cbdc4"/></svg>').toString('base64');
const result=await importMercadoLivreData({inputUrl:original,resolvedUrl:original,operation:'celulares'},async(path,resource)=>({data:null,check:{resource,state:'denied',httpStatus:403}}));
const pending={...result.product,name:'Capa para celular — referência de teste visual',price:49.9,image};
const css=['globals.css','workspace.css','premium.css','publication-workspace.css','operation-theme.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n');
mkdirSync('outputs/premium-review',{recursive:true});
for(const [name,p]of [['mlimport',{...emptyProduct(),operation:'celulares' as const,originalUrl:original}],['mlpending',pending],['mlmissing',{...pending,price:0,image:''}],['mlinformed',{...pending,affiliateUrl:'https://meli.la/visual-fixture',mercadoLivreImport:{...pending.mercadoLivreImport!,affiliateState:'informed' as const,affiliateConfirmed:true}}]] as const){
 const app=h('main',{className:'offer-page','data-operation':'celulares'},h('header',{className:'offer-page-header'},h('a',{className:'brand',href:'#'},'dropou.'),h('a',{className:'secondary',href:'#'},'Voltar ao painel')),h(ProductForm,{product:p,page:true,lockedOperation:true,onClose(){},onSave:async()=>{}}));
 writeFileSync('outputs/premium-review/'+name+'.html','<!doctype html><html lang="pt-BR" data-operation="celulares"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+renderToStaticMarkup(app)+'</body></html>');
}
console.log('Four Mercado Livre import fixtures generated.');
