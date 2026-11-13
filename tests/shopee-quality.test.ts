import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultShopeeConfig,assessShopeeOffer,salesTrend,diversifyOffers,type ShopeeOffer,type OfferObservation} from '../src/lib/shopee-automation';
import {productOfferQuery} from '../src/server/shopee/client';
import {shopeeSearchPlan} from '../src/lib/shopee-search';
import {offerFingerprint} from '../src/lib/shopee-quality';
import {curatedDiscovery} from '../src/lib/shopee-curation';
const config=defaultShopeeConfig();
const good=(extra:Partial<ShopeeOffer>={}):ShopeeOffer=>({itemId:'1',shopId:'1',name:'Teclado Gamer Logitech G Pro',price:180,priceMax:180,image:'https://cf.shopee.com.br/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/1/1',sales:10000,rating:4.8,reportedDiscount:30,commission:0.1,checkedAt:'2026-11-12T12:00:00Z',...extra});
const sample=(sales:number,observed_at:string,extra:Partial<OfferObservation>={}):OfferObservation=>({shop_id:'1',item_id:'1',observed_at,sales,price:200,price_max:200,...extra});

test('medical and immobilizer kits never inherit relevance from USB, gamer or a known brand',()=>{
 for(const name of ['Kit imobilizador gamer USB Logitech','Suporte imobilização PC','Kit ortopédico gamer','Monitor hospitalar PC','Kit chave transponder Intel','Controle automotivo gamer','Luva imobilizadora gaming','Kit genérico gamer USB 10 peças'])assert.equal(assessShopeeOffer(good({name}),config).relevant,false,name);
 for(const name of ['Processador AMD Ryzen 5 5600','Placa de vídeo Intel Arc A750','Placa mãe Asus AM4 B450','Fonte ATX Corsair 650W','Memória RAM DDR4 Kingston 16GB','Smartphone Samsung A55 128GB'])assert.equal(assessShopeeOffer(good({name}),config).relevant,true,name);
});
test('new candidates remain manual, review volume is only counted when supplied, and launch text invents no trend',()=>{
 const a=assessShopeeOffer(good({name:'Processador AMD Ryzen 7 9700X lançamento',sales:3,rating:null,ratingCount:null}),config);
 assert.equal(a.recommended,true);assert.equal(a.eligible,false);assert.equal(a.trend.state,'insufficient');assert.ok(!a.recommendationReasons.some(r=>/lançamento|crescimento/i.test(r)));
 const sparseUnknown=assessShopeeOffer(good({name:'Mouse gamer desconhecido',sales:3,rating:null}),config);assert.equal(sparseUnknown.recommended,false);
 const many=assessShopeeOffer(good({ratingCount:1000}),config),one=assessShopeeOffer(good({ratingCount:1}),config);assert.ok(many.score>one.score);assert.ok(many.recommendationReasons.includes('Muitas avaliações'));
});
test('curation recomputes old cache, shares count/list, limits repeated models, and excludes rejected/published equivalents',()=>{
 const make=(id:string,name:string)=>({id,shop_id:'1',item_id:id,data:good({itemId:id,name}),decision:'found'});
 const rows=[make('1','Mouse Logitech G502 gamer preto'),make('2','Logitech G502 mouse branco oficial'),make('3','SSD Kingston NV2 1TB'),make('4','SSD Kingston NV2 2TB'),make('5','Kit imobilizador gamer'),make('6','Processador AMD Ryzen 5 5600')];
 assert.equal(offerFingerprint(rows[0].data.name),offerFingerprint(rows[1].data.name));assert.notEqual(offerFingerprint(rows[2].data.name),offerFingerprint(rows[3].data.name));
 const rejected={...make('7','Mouse Logitech G502 gaming'),decision:'rejected'};
 const p={id:'p',data:{name:'SSD Kingston NV2 1TB'},canonical_url:'unrelated-listing',curation_state:'approved',archived_at:null};
 const selected=curatedDiscovery([...rows,rejected],[p],new Set(['p']),config,[]);
 assert.deepEqual(new Set(selected.map(r=>r.id)),new Set(['4','6']));
 const mice=Array.from({length:20},(_,i)=>make(String(i),'Mouse Logitech G'+(1000+i)));
 assert.equal(curatedDiscovery(mice,[],new Set(),config,[]).length,2);
});
test('recommendation redistributes 30/25/25/10/10 across available evidence and ignores commission',()=>{
 assert.equal(config.minSales,1000);assert.equal(config.minRating,4.6);assert.equal(config.minDiscount,15);
 const a=assessShopeeOffer(good(),config);assert.equal(a.eligible,true);assert.equal(a.recommended,true);assert.equal(a.components.trend,null);assert.equal(a.score,83);assert.equal(a.components.relevance,27.8);
 assert.equal(assessShopeeOffer(good({commission:1}),config).score,a.score);assert.equal(assessShopeeOffer(good({commission:null}),config).score,a.score);
 const max=assessShopeeOffer(good({sales:10000000,rating:5,commission:1,previousPrice:500,previousAt:'2026-11-11T12:00:00Z',reportedDiscount:64}),config);assert.equal(max.score,100);
 assert.equal(assessShopeeOffer(good({sales:12,rating:3,commission:1}),config).eligible,false);
 assert.equal(assessShopeeOffer(good({sales:999}),config).eligible,false);assert.equal(assessShopeeOffer(good({rating:4.5}),config).eligible,false);assert.equal(assessShopeeOffer(good({reportedDiscount:14}),config).eligible,false);
});
test('missing data is unavailable, distinct from zero: high estimated scores alone cannot qualify sparse products',()=>{
 const sparse=assessShopeeOffer(good({sales:null,rating:null,commission:null,reportedDiscount:null}),config);assert.equal(sparse.score,100);assert.equal(sparse.confidence,20);assert.equal(sparse.eligible,false);assert.equal(sparse.recommended,false);assert.equal(sparse.components.sales,null);
 const noDiscount=assessShopeeOffer(good({reportedDiscount:null}),config);assert.equal(noDiscount.discountSource,'none');assert.equal(noDiscount.components.price,null);assert.ok(noDiscount.warnings.some(w=>w.includes('desconhecido')));
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
test('search rotates four focused families inside the existing budget and preserves custom keywords',()=>{
 const plan=shopeeSearchPlan(config,'2026-11-12');assert.equal(plan.length,4);assert.notEqual(plan[0].input.keyword,'gamer');const q=productOfferQuery(plan[0].input);assert.match(q,/sortType:2/);assert.match(q,/listType:2/);assert.ok(plan.some(p=>/placa|processador|ssd|memoria|fonte|gabinete|cooler/.test(p.input.keyword||'')));
 assert.equal(shopeeSearchPlan({...config,searchMode:'categories',categoryIds:[11059980]},'2026-11-12')[0].input.categoryId,11059980);
 assert.throws(()=>productOfferQuery({limit:10,categoryId:-1}));assert.throws(()=>productOfferQuery({limit:10,listType:99 as 2}));
 assert.equal(shopeeSearchPlan({...config,keywords:['gamer']},'2026-11-12').length,1);
 assert.equal(shopeeSearchPlan({...config,keywords:['gamer']},'2026-11-12')[0].key,shopeeSearchPlan({...config,keywords:['gamer'],searchMode:'popular'},'2026-11-12')[0].key);
});
