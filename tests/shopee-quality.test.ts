import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultShopeeConfig,assessShopeeOffer,salesTrend,diversifyOffers,type ShopeeOffer,type OfferObservation} from '../src/lib/shopee-automation';
import {productOfferQuery} from '../src/server/shopee/client';
import {shopeeSearchPlan} from '../src/lib/shopee-search';
const config=defaultShopeeConfig();
const good=(extra:Partial<ShopeeOffer>={}):ShopeeOffer=>({itemId:'1',shopId:'1',name:'Teclado Gamer Logitech G Pro',price:180,priceMax:180,image:'https://cf.shopee.com.br/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/1/1',sales:10000,rating:4.8,reportedDiscount:30,commission:0.1,checkedAt:'2026-11-12T12:00:00Z',...extra});
const sample=(sales:number,observed_at:string,extra:Partial<OfferObservation>={}):OfferObservation=>({shop_id:'1',item_id:'1',observed_at,sales,price:200,price_max:200,...extra});
test('quality defaults apply the requested references, normalize 40/25/20/15, and never reward commission alone',()=>{
 assert.equal(config.minSales,1000);assert.equal(config.minRating,4.6);assert.equal(config.minDiscount,15);
 const a=assessShopeeOffer(good(),config);assert.equal(a.eligible,true);assert.equal(a.components.sales,32);assert.equal(a.components.rating,22.5);assert.equal(a.components.price,6);assert.equal(a.components.commission,7.5);assert.equal(a.score,68);
 const max=assessShopeeOffer(good({sales:10000000,rating:5,commission:1,previousPrice:500,previousAt:'2026-11-11T12:00:00Z',reportedDiscount:64}),config);assert.equal(max.score,100);
 assert.equal(assessShopeeOffer(good({sales:12,rating:3,commission:1}),config).eligible,false);
 assert.equal(assessShopeeOffer(good({sales:999}),config).eligible,false);assert.equal(assessShopeeOffer(good({rating:4.5}),config).eligible,false);assert.equal(assessShopeeOffer(good({reportedDiscount:14}),config).eligible,false);
});
test('missing data lowers coverage and score, reported discounts never fabricate an old price, variant bait is blocked',()=>{
 const sparse=assessShopeeOffer(good({sales:null,rating:null,commission:null,reportedDiscount:null}),config);assert.equal(sparse.score,0);assert.equal(sparse.confidence,40);assert.equal(sparse.eligible,false);
 const noDiscount=assessShopeeOffer(good({reportedDiscount:null}),config);assert.equal(noDiscount.discountSource,'none');assert.equal(noDiscount.components.price,0);assert.ok(noDiscount.warnings.some(w=>w.includes('desconhecido')));
 const reported=assessShopeeOffer(good(),config);assert.equal(reported.observedDiscount,null);assert.equal(reported.discountSource,'reported');
 assert.equal(assessShopeeOffer(good({price:1,priceMax:180}),config).eligible,false);assert.equal(assessShopeeOffer(good({priceMax:181}),config).eligible,false);
 assert.equal(assessShopeeOffer(good({image:'https://attacker.test/p'}),config).eligible,false);
});
test('gamer relevance includes tech breadth while rejecting irrelevant and suspicious products',()=>{
 for(const name of ['Controle DualSense PS5','SSD NVMe Kingston 1TB','Smartwatch Amazfit Bip','Fone Bluetooth JBL','Webcam Logitech','Mouse Gamer Razer','Headset HyperX','Cadeira gamer','Suporte Nintendo Switch'])assert.equal(assessShopeeOffer(good({name}),config).eligible,true,name);
 for(const name of ['Jogo de panelas','Furadeira profissional','Vestido festa','Controle remoto portão','Teclado gamer réplica','Monitor de pressão arterial','Mini Processador Triturador Sem Fio Elétrico 250ML De Alimentos Para Legumes Alho Gengibre','Kit Shampoo Gamer e Condicionador','Batedor de Café USB','Creatina gamer']){const a=assessShopeeOffer(good({name}),config);assert.equal(a.eligible,false,name);assert.equal(a.relevant,name==='Teclado gamer réplica',name);}
 assert.equal(assessShopeeOffer(good({name:'Processador AMD Ryzen 5 5600'}),config).eligible,true);
});
test('sales trend requires real separated observations; counters, duplicate times and different products cannot invent a trend',()=>{
 const o=good({sales:1400}),h=[sample(1000,'2026-11-10T12:00:00Z'),sample(1100,'2026-11-11T12:00:00Z')];const trend=salesTrend(o,h);assert.equal(trend.state,'accelerating');assert.equal(trend.delta,300);assert.equal(trend.perDay,300);
 assert.equal(salesTrend(o,[sample(1300,'2026-11-12T11:59:00Z')]).state,'insufficient');assert.equal(salesTrend(o,[sample(2000,'2026-11-11T12:00:00Z')]).state,'counter_reset');
 assert.equal(salesTrend(o,[sample(1000,'2026-11-10T12:00:00Z',{shop_id:'2'})]).state,'insufficient');assert.equal(salesTrend(o,[sample(1400,'2026-11-11T12:00:00Z')]).state,'stable');
 const drop=assessShopeeOffer(good({price:180}),config,[sample(1000,'2026-11-11T12:00:00Z')]);assert.equal(drop.observedDiscount,10);assert.equal(drop.eligible,false);
 const future=assessShopeeOffer(good({reportedDiscount:null,previousPrice:300,previousAt:'2026-11-13T12:00:00Z'}),config);assert.equal(future.observedDiscount,null);
 const increased=assessShopeeOffer(good(),config,[sample(1000,'2026-11-11T12:00:00Z',{price:100,price_max:100})]);assert.equal(increased.components.price,0);assert.ok(increased.warnings.some(w=>w.includes('acima')));
});
test('selection diversifies category, brand and price; product aliases do not duplicate slots',()=>{
 const offers=[good({name:'Mouse Gamer Logitech G Pro'}),good({itemId:'2',name:'Mouse Gamer Logitech G Pro Branco'}),good({itemId:'3',name:'Mouse Gamer Logitech G502'}),good({itemId:'4',name:'SSD NVMe Kingston 1TB',price:350,priceMax:350}),good({itemId:'5',name:'Headset HyperX Cloud',price:300,priceMax:300})];
 const rows=offers.map((data,i)=>({id:String(i),data,assessment:assessShopeeOffer(data,config)})),chosen=diversifyOffers(rows,3);assert.equal(chosen.length,3);assert.equal(new Set(chosen.map(r=>r.assessment.category)).size,3);assert.equal(chosen.filter(r=>r.data.name.includes('G Pro')).length,1);
});
test('search sends the experimentally accepted parameters and bounds all sources in the same budget',()=>{
 const plan=shopeeSearchPlan(config,'2026-11-12');assert.equal(plan.length,4);assert.equal(plan[0].input.keyword,'gamer');const q=productOfferQuery(plan[0].input);assert.match(q,/sortType:2/);assert.match(q,/listType:2/);assert.match(q,/keyword:"gamer"/);
 assert.equal(shopeeSearchPlan({...config,searchMode:'categories',categoryIds:[11059980]},'2026-11-12')[0].input.categoryId,11059980);
 assert.throws(()=>productOfferQuery({limit:10,categoryId:-1}));assert.throws(()=>productOfferQuery({limit:10,listType:99 as 2}));
 assert.equal(shopeeSearchPlan({...config,keywords:['gamer']},'2026-11-12').length,1);
 assert.equal(shopeeSearchPlan({...config,keywords:['gamer']},'2026-11-12')[0].key,shopeeSearchPlan({...config,searchMode:'popular'},'2026-11-12')[0].key);
});
