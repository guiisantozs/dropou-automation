import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationIntegrationUnavailable,workspaceAdminRequired} from '../src/lib/operator-access';
import {productSchema} from '../src/lib/domain';
import {emptyProduct} from '../src/lib/product-draft';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Link2} from 'lucide-react';
import WorkspaceSidebar from '../src/components/workspace-sidebar';

test('new local dashboards cannot use Telegram account or mirror integrations',()=>{
 for(const brand of ['beleza','casa','natal'])for(const path of ['/api/telegram/connections','/api/mirrored-offers'])for(const method of ['GET','POST'])assert.equal(operationIntegrationUnavailable(brand,path,method),true);
 for(const brand of ['dropou','celulares'])assert.equal(operationIntegrationUnavailable(brand,'/api/telegram/connections','GET'),false);
 assert.equal(workspaceAdminRequired('/api/shopee/curation-config','PATCH'),true);
});

test('consolidated product validation preserves local used-device condition and new creative brands',()=>{
 for(const creativeBrand of ['beleza','casa','natal'] as const){
  const product={...emptyProduct(),store:'Shopee',name:'Smartphone de teste',niche:'Smartphones',price:100,originalUrl:'https://shopee.com.br/product/1/2',creativeBrand,visualDetails:{condition:'seminovo',brand:null,model:null,selectedVariant:null,rating:null,salesCount:null,sellerName:null,displayedDiscount:null,uncertainFields:[]}};
  assert.equal(productSchema.parse(product).visualDetails?.condition,'seminovo');
 }
});

test('premium sidebar retains the local Telegram and persistent mirror destinations',()=>{
 const noop=()=>{};
 const html=renderToStaticMarkup(React.createElement(WorkspaceSidebar,{light:true,brand:'dropou',active:'Ofertas espelhadas',items:['Conexões Telegram','Ofertas espelhadas'].map(id=>({id,label:id,icon:Link2})),onBrand:noop,onNavigate:noop,onCreate:noop,onHelp:noop}));
 assert.match(html,/Conexões Telegram/);assert.match(html,/Ofertas espelhadas/);
 assert.match(html,/aria-current="page"/);
});
