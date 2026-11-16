import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celularFacts,celularSearchTerms,defaultCelularesConfig,celularesConfigSchema,celularCategories} from '../src/lib/celulares-curation';
import {assessShopeeOffer,defaultShopeeConfig,type ShopeeOffer} from '../src/lib/shopee-automation';
import {compareCelularPrices,diversifyCelulares} from '../src/lib/celulares-quality';
import {celularesView} from '../src/lib/celulares-view';
import {curatedDiscovery} from '../src/lib/shopee-curation';
const config=defaultShopeeConfig(),policy=defaultCelularesConfig();
function offer(name='Smartphone Samsung Galaxy A55 256GB 8GB RAM 5G Novo',overrides:Partial<ShopeeOffer>={}):ShopeeOffer{return {name,shopId:'1',itemId:'2',price:1500,priceMax:1500,rating:4.8,sales:1000,commission:.05,reportedDiscount:null,checkedAt:'2026-11-15T15:00:00.000Z',image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://shope.ee/fixture',productLink:'https://shopee.com.br/product/1/2',...overrides};}
const assess=(o:ShopeeOffer)=>assessShopeeOffer(o,config,[],'celulares',policy);
test('Celulares classifies smartphones before accessories only when the actual item is a phone',()=>{
 for(const name of ['Smartphone Samsung Galaxy A55 256GB','Smartphone Moto G84 128GB','Motorola Edge 50','Xiaomi Redmi Note 13 Pro','POCO F6','Apple iPhone 13 128GB seminovo','Smartphone Huawei Pura70','Smartphone Google Pixel 8'])assert.equal(celularFacts(name).category,'smartphones',name);
 for(const name of ['Capinha iPhone 15','Película Samsung Galaxy A55','Carregador veicular USB C 30W','Cabo Lightning iPhone','Hub USB C para smartphone'])assert.equal(celularFacts(name).category,'accessories',name);
 for(const [name,category] of [['Fone QCY Bluetooth TWS','audio'],['Headphone Soundcore ANC','audio'],['AirPods Pro 2','audio'],['Samsung Galaxy Watch 7','watches'],['Xiaomi Smart Band 9','watches'],['Amazfit Bip 5','watches'],['Rastreador Bluetooth SmartTag','gadgets'],['Mini impressora térmica Bluetooth','gadgets'],['Microfone sem fio para celular','gadgets'],['Estabilizador para smartphone','gadgets']] as const)assert.equal(celularFacts(name).category,category,name);
});
test('Celulares excludes broken phones, explicit replicas, unidentified cases, old screen protectors and other niches',()=>{
 for(const name of ['iPhone 13 128GB com defeito','iPhone 14 retirada de peças','iPhone 15 réplica original','Smartphone Galaxy A55 não liga','Capinha universal cores sortidas','Película iPhone 5','Bobina papel mini impressora térmica','Cabo de embreagem moto','Tênis Nike','Liquidificador cozinha','Microfone profissional sem fio para palco'])assert.ok(celularFacts(name).blocks.length,name);
 assert.equal(assess(offer('iPhone 15 128GB')).recommended,false);
 assert.equal(assess(offer('iPhone 15 128GB usado')).mobile?.condition,'usado');
 assert.equal(assess(offer('iPhone 15 128GB seminovo')).mobile?.condition,'seminovo');
 assert.equal(assess(offer('iPhone 15 128GB recondicionado')).mobile?.condition,'recondicionado');
 assert.equal(assess(offer('Smartphone Samsung Galaxy A55')).mobile?.condition,null);
});
test('phone facts use literal capacity, RAM and warranty; different or incomplete variants never compare',()=>{
 const a=celularFacts('Smartphone Samsung Galaxy A55 256GB 8GB RAM 5G novo garantia de 12 meses');assert.equal(a.storageGB,256);assert.equal(a.ramGB,8);assert.equal(a.warranty,'garantia de 12 meses');assert.ok(a.variantKey);
 assert.equal(celularFacts('Smartphone Galaxy A55 256GB 8GB RAM 5G novo').variantKey,a.variantKey);
 for(const name of ['Smartphone Galaxy A55 128GB 8GB RAM 5G novo','Smartphone Galaxy A55 256GB 12GB RAM 5G novo','Smartphone Galaxy A55 256GB 8GB RAM 4G novo','Smartphone Galaxy A55 256GB 8GB RAM 5G usado'])assert.notEqual(celularFacts(name).variantKey,a.variantKey);
 assert.equal(celularFacts('Smartphone Galaxy A55 256GB novo').variantKey,null);
 assert.ok(celularFacts('Smartphone Galaxy A55 128GB 256GB novo').blocks.length);
});
test('quality uses observed evidence, keeps missing indicators unknown and blocks unverified price ranges',()=>{
 const unknown=assess(offer(undefined,{sales:null,rating:null,reportedDiscount:90}));assert.equal(unknown.recommended,false);assert.equal(unknown.mobile?.sellerReputation,null);assert.equal(unknown.mobile?.ratingCount,null);assert.equal(unknown.components.sales,null);assert.equal(unknown.components.rating,null);assert.equal(unknown.observedDiscount,null);assert.equal(unknown.components.price,null);assert.equal(unknown.trend.delta,null);
 assert.equal(assess(offer(undefined,{price:100,priceMax:1500})).recommended,false);
 assert.equal(assess(offer(undefined,{sales:40,rating:4.8})).recommended,true);
 assert.equal(assess(offer('Fone Bluetooth Marca Pequena X22',{price:80,priceMax:80,sales:500,rating:4.9})).recommended,true);
 assert.equal(assess(offer('Smartphone Galaxy A55 256GB novo',{rating:3.8})).recommended,false);
});
test('verified discounts require observation of the same explicit variant; provider percentages never create old prices',()=>{
 const o=offer(),key=celularFacts(o.name).variantKey!,base={shop_id:o.shopId,item_id:o.itemId,observed_at:'2026-11-13T15:00:00.000Z',price:2000,price_max:2000,sales:900};
 assert.equal(assessShopeeOffer(o,config,[base],'celulares').observedDiscount,null);
 assert.equal(assessShopeeOffer(o,config,[{...base,variant_key:key}],'celulares').observedDiscount,25);
 assert.equal(assessShopeeOffer(o,config,[{...base,variant_key:'different:128GB'}],'celulares').observedDiscount,null);
});
test('price comparisons require multiple distinct sellers and exactly matching comparable facts',()=>{
 const make=(id:string,price:number,name=offer().name)=>{const data=offer(name,{shopId:id,itemId:id,price,priceMax:price});return {id,data,assessment:assess(data)};};
 const rows=[make('1',1500),make('2',2000),make('3',2100),make('4',900,'Smartphone Galaxy A55 128GB 8GB RAM 5G novo')];compareCelularPrices(rows);assert.equal(rows[0].assessment.mobile?.comparison?.median,2050);assert.equal(rows[0].assessment.mobile?.comparison?.equivalents,2);assert.equal(rows[3].assessment.mobile?.comparison,undefined);
 const duplicate=[make('1',1500),make('2',2000),make('2',2100)];compareCelularPrices(duplicate);assert.equal(duplicate[0].assessment.mobile?.comparison,undefined);
});
test('weighted discovery covers smartphone families and all categories without weakening budgets or calling providers',()=>{
 const terms=Array.from({length:20},(_,i)=>celularSearchTerms(i*5,policy)).flat().join(' ');for(const word of ['iphone','galaxy','moto g','redmi','poco','qcy','watch','usb c','impressora'])assert.ok(terms.includes(word),word);
 assert.equal(celularSearchTerms(0,policy)[0],'smartphone samsung galaxy a');
 assert.notDeepEqual(celularSearchTerms(0,policy),celularSearchTerms(5,policy));assert.deepEqual(celularSearchTerms(0,policy,['termo personalizado']),['termo personalizado']);
 assert.throws(()=>celularesConfigSchema.parse({...policy,requestsPerSearch:6}));assert.throws(()=>celularesConfigSchema.parse({...policy,weights:Object.fromEntries(celularCategories.map(c=>[c,0]))}));
});
test('diversity prevents an accessory flood, keeps unknown brands and never fills missing phones with bad listings',()=>{
 const names=['Smartphone Galaxy A55 256GB 8GB RAM 5G novo','Fone Bluetooth TWS X','Smartwatch esportivo X','Carregador USB C X','Mini impressora térmica Bluetooth X'];
 const rows=names.flatMap((name,k)=>Array.from({length:30},(_,i)=>{const data=offer(name+(k===0?' modelo ':' ')+(i+10),{itemId:k+'-'+i,shopId:String(i),price:100+i,priceMax:100+i});return {id:k+'-'+i,data,assessment:assess(data)};}));
 const selected=diversifyCelulares(rows,policy,new Set());assert.ok(selected.length>10);assert.ok(new Set(selected.map(r=>r.assessment.mobile?.category)).size>=4);assert.ok(selected.filter(r=>r.assessment.mobile?.category==='accessories').length<=9);
 const onlyAccessories=diversifyCelulares(rows.filter(r=>r.assessment.mobile?.category==='accessories'),policy,new Set());assert.ok(onlyAccessories.length<policy.selectionSize);
});
test('category filters and sorting keep missing values last and ignore reported discounts',()=>{
 const data=[{data:offer(undefined,{sales:null,price:1200}),assessment:assess(offer())},{data:offer('Fone Bluetooth JBL',{price:100,priceMax:100,sales:900}),assessment:assess(offer('Fone Bluetooth JBL',{price:100,priceMax:100}))}];
 assert.equal(celularesView(data,'smartphones','relevance').length,1);assert.equal(celularesView(data,'all','sales')[0].data.sales,900);assert.equal(celularesView(data,'all','price')[0].data.price,100);
 const cache=data.map((r,i)=>({...r,assessment:{...r.assessment,discountSource:i?'reported' as const:'observed' as const,observedDiscount:i?90:10}}));assert.equal(celularesView(cache,'all','discount')[0].assessment.discountSource,'observed');
});
test('published/rejected products in one channel never remove the other channel recommendation',()=>{
 const o=offer(),cache=[{id:'cached',shop_id:o.shopId,item_id:o.itemId,data:o,decision:'found'}];assert.equal(curatedDiscovery(cache,[],new Set(),config,[],'celulares').length,1);
 assert.equal(curatedDiscovery([{...cache[0],decision:'rejected'}],[],new Set(),config,[],'celulares').length,0);
 assert.equal(curatedDiscovery(cache,[],new Set(['different-channel-product']),config,[],'celulares').length,1);
});
