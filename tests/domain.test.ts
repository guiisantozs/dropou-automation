import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caption, cleanCandidates, defaultSchedule, discount, publicationError, productSchema, scheduleSlot, transitionError } from '../src/lib/domain';
import { demoProducts } from '../src/lib/demo';
import { importCsv } from '../src/lib/csv';
const base=()=>({...demoProducts()[0],demo:false,status:'pronto' as const,affiliateUrl:'https://meli.la/exemplo-colado-pelo-usuario'});
test('legenda omite preço anterior e parcelamento sem verificação',()=>{
 const p={...base(),previousVerified:false,installments:'12x sem juros',installmentsVerified:false};
 const text=caption(p);assert.ok(text.includes('#publi'));assert.ok(!text.includes('De:'));assert.ok(!text.includes('Economia'));assert.ok(!text.includes('12x'));assert.equal(discount(p),null);
});
test('economia real usa diferença positiva, nunca desconto inventado',()=>{
 const p={...base(),price:80,previousPrice:100,previousVerified:true};assert.equal(discount(p),20);
 assert.ok(caption(p).includes('20,00'));assert.equal(discount({...p,price:120}),null);assert.ok(!caption({...p,price:120}).includes('De:'));
});
test('publicação bloqueia demo, estoque, ausência de link e preço expirado',()=>{
 const p=base();assert.equal(publicationError(p),null);
 assert.ok(publicationError({...p,demo:true}));assert.ok(publicationError({...p,inStock:false}));assert.ok(publicationError({...p,affiliateUrl:''}));assert.ok(publicationError({...p,checkedAt:null}));
 assert.ok(publicationError({...p,checkedAt:new Date(Date.now()-16*60000).toISOString()}));assert.ok(publicationError({...p,checkedAt:new Date(Date.now()+60000).toISOString()}));
});
test('remove duplicados, esgotados, publicados e preços expirados dos candidatos',()=>{
 const p=base();assert.equal(cleanCandidates([p,{...p,id:crypto.randomUUID(),originalUrl:p.originalUrl+'?utm_source=x'},{...p,id:crypto.randomUUID(),originalUrl:'https://www.mercadolivre.com.br/esgotado',inStock:false},{...p,id:crypto.randomUUID(),originalUrl:'https://www.mercadolivre.com.br/velho',checkedAt:'2020-01-01T00:00:00.000Z'}]).length,1);
});
test('horários são calculados no fuso America/Bahia',()=>{
 const s={...defaultSchedule,enabled:true};assert.equal(scheduleSlot(s,new Date('2026-11-05T12:00:00Z')),'2026-11-05T09:00');assert.equal(scheduleSlot(s,new Date('2026-11-05T12:01:00Z')),null);assert.equal(scheduleSlot(defaultSchedule,new Date('2026-11-05T12:00:00Z')),null);
});
test('CSV importa produto sem afirmar revalidação e rejeita duplicata',()=>{
 const text='nome,nicho,loja,preco,preco_anterior,preco_anterior_verificado,link_original\nMouse gamer,Games,Mercado Livre,99.9,199.9,false,https://www.mercadolivre.com.br/mouse';
 const r=importCsv(text,[]);assert.equal(r.products.length,1);assert.equal(r.products[0].checkedAt,null);assert.equal(r.products[0].previousVerified,false);assert.equal(importCsv(text,r.products).errors.length,1);
});
test('CSV aceita campos com vírgula entre aspas e rejeita preços inválidos',()=>{
 const head='nome,nicho,loja,preco,link_original\n';assert.equal(importCsv(head+'"Mouse, RGB",Games,Shopee,100,https://shopee.com.br/mouse',[]).products[0].name,'Mouse, RGB');assert.equal(importCsv(head+'Mouse gamer,Games,Shopee,-1,https://shopee.com.br/mouse',[]).products.length,0);
});
test('URLs não podem usar javascript ou domínios que imitam lojas',()=>{
 assert.equal(productSchema.safeParse({...base(),affiliateUrl:'javascript:alert(1)'}).success,false);
 assert.equal(productSchema.safeParse({...base(),originalUrl:'https://mercadolivre.com.br.evil.example/test'}).success,false);
});
test('fila demo simula publicação sem link fabricado; histórico bloqueia repetição',()=>{
 const p=demoProducts()[0];assert.equal(transitionError(p,'publicado'),null);
 assert.ok(transitionError({...base(),status:'publicado'},'pronto'));
 assert.ok(transitionError({...base(),affiliateUrl:''},'pronto'));
});
