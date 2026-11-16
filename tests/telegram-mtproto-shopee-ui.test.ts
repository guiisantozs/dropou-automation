import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import TelegramShopeeTestQueue from '../src/components/telegram-shopee-test-queue';
import type {MtprotoShopeeQueue} from '../src/lib/telegram-mtproto-shopee';

test('test queue presents identity, local catalog evidence and errors without republication or invented price/images',()=>{
 const queue:MtprotoShopeeQueue={available:true,expiresAt:null,limitReached:true,items:[{id:'1:0',messageId:1,kind:'photo',messageAt:'2026-11-15T22:00:00Z',receivedAt:'2026-11-15T22:00:01Z',state:'identified',canonicalUrl:'https://shopee.com.br/product/123/456',shopId:'123',itemId:'456',catalog:{status:'found',name:'Mouse <script>private</script>',productId:'local'},error:null,repeatedInTest:false},{id:'2:0',messageId:2,kind:'text',messageAt:'2026-11-15T22:00:00Z',receivedAt:'2026-11-15T22:00:01Z',state:'error',canonicalUrl:null,shopId:null,itemId:null,catalog:null,error:'Não foi possível resolver o link curto.',repeatedInTest:false}]};
 const html=renderToStaticMarkup(createElement(TelegramShopeeTestQueue,{queue}));
 assert.match(html,/foto com legenda/);assert.match(html,/Já existe no catálogo desta marca/);assert.match(html,/Loja 123/);assert.match(html,/produto 456/);assert.match(html,/Não foi possível resolver/);assert.match(html,/Limite desta janela/);
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<button'));assert.ok(!html.includes('R$'));
 assert.match(html,/Nenhum produto será cadastrado ou publicado/);assert.match(html,/API oficial Shopee/);
});

test('conversion queue separates canonical identity and official affiliate output with API facts and explicit missing fields',()=>{
 const queue:MtprotoShopeeQueue={available:true,expiresAt:null,limitReached:false,items:[{id:'1:0',messageId:1,kind:'photo',messageAt:'2026-11-15T22:00:00Z',receivedAt:'2026-11-15T22:00:01Z',state:'identified',canonicalUrl:'https://shopee.com.br/product/123/456',shopId:'123',itemId:'456',catalog:{status:'missing'},error:null,repeatedInTest:false,conversion:{state:'generated',affiliateUrl:'https://s.shopee.com.br/our-fixture',error:null,source:'api',product:{name:'Produto oficial',image:'https://down-br.img.susercontent.com/file/fixture',price:100,priceMax:150,checkedAt:'2026-11-15T22:00:01Z'}}}]};
 const html=renderToStaticMarkup(createElement(TelegramShopeeTestQueue,{queue}));
 for(const pattern of [/Produto oficial/,/Link gerado/,/Copiar link afiliado/,/our-fixture/,/Preço anterior e variação específica/,/Referência canônica/,/Plataforma: Shopee/,/Nenhum cadastro será criado/])assert.match(html,pattern);
 assert.match(html,/<img/);assert.ok(!html.includes('Publicar'));
 queue.items[0].conversion={state:'error',affiliateUrl:null,error:'Limite diário de importação atingido.',source:null,product:null};
 const failed=renderToStaticMarkup(createElement(TelegramShopeeTestQueue,{queue}));assert.match(failed,/Falha na conversão/);assert.match(failed,/Limite diário/);assert.ok(!failed.includes('Copiar link afiliado'));assert.ok(!failed.includes('our-fixture'));assert.ok(!failed.includes('<img'));
});
