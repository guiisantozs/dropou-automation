import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {shopeeAuthorization,productOfferQuery,parseShopeeOffers,requestShopee,ShopeeApiError,shopeeEndpoint} from '../src/server/shopee/client';
import {assessShopeeOffer,defaultShopeeConfig,dailyKeywords,bahiaDay,futureSlots,shopeeCaption,priceCurrent,liveShopeeAllowed,shopeeConfigSchema,type ShopeeOffer} from '../src/lib/shopee-automation';
import {sendTelegramTo,TelegramFailure} from '../src/server/telegram-core';
export const mockShopeeOffer=(overrides:Partial<ShopeeOffer>={}):ShopeeOffer=>({itemId:'9001',shopId:'8001',name:'Controle PC Xbox Bluetooth',price:180,priceMax:180,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture-affiliate',productLink:'https://shopee.com.br/product/8001/9001',rating:4.8,sales:1000,commission:0.08,reportedDiscount:70,checkedAt:new Date().toISOString(),...overrides});
const rawNode=(overrides:Record<string,unknown>={})=>({itemId:'9001',shopId:'8001',productName:'Controle PC Xbox Bluetooth',priceMin:'180.00',priceMax:'180.00',imageUrl:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture-affiliate',productLink:'https://shopee.com.br/product/8001/9001',ratingStar:'4.8',sales:1000,commissionRate:'0.08',priceDiscountRate:70,...overrides});
const payload=(nodes:unknown[])=>({data:{productOfferV2:{nodes}}});
test('Shopee signs the exact UTF-8 JSON sent once, Unix seconds, with no extra link-generation calls',async()=>{
 let reserved=0,calls=0;const events:unknown[]=[];
 const result=await requestShopee({keyword:'controle 🎮 "PC"',limit:10},{appId:'123456',secret:'test-only-secret',approved:true},async()=>{reserved++;return 'reserved-id';},async(...args)=>{events.push(args);},async(url,init)=>{
  calls++;assert.equal(reserved,1);assert.equal(url,shopeeEndpoint);assert.equal(init?.redirect,'error');const body=String(init?.body),auth=(init?.headers as Record<string,string>).Authorization;
  const timestamp=Number(auth.match(/Timestamp=(\d+)/)![1]);assert.ok(Math.abs(timestamp-Math.floor(Date.now()/1000))<2);
  const digest=createHash('sha256').update('123456'+timestamp+body+'test-only-secret','utf8').digest('hex');assert.equal(auth,`SHA256 Credential=123456, Timestamp=${timestamp}, Signature=${digest}`);
  assert.notEqual(shopeeAuthorization('123456','test-only-secret',body+' ',timestamp),auth);assert.match(JSON.parse(body).query,/productOfferV2/);return Response.json(payload([rawNode()]));
 });
 assert.equal(calls,1);assert.equal(result[0].offerLink,rawNode().offerLink);assert.deepEqual(events,[['reserved-id','ok',0]]);
});
test('Shopee credentials and atomic budget refusal stop before any HTTP request',async()=>{
 let calls=0,reservations=0;const http:typeof fetch=async()=>{calls++;throw new Error('No call expected');};
 await assert.rejects(requestShopee({keyword:'controle pc',limit:10},{approved:false},async()=>{reservations++;return 'id';},async()=>{},http),/credenciais/);
 await assert.rejects(requestShopee({keyword:'controle pc',limit:10},{appId:'test',secret:'test',approved:true},async()=>{reservations++;return null;},async()=>{},http),/Orçamento/);
 assert.equal(calls,0);assert.equal(reservations,1);assert.throws(()=>productOfferQuery({itemId:'1) { secret }',limit:1}));
});
test('Shopee rejects unsafe IDs, URLs, swapped identities and malformed prices without inventing optional fields',()=>{
 const offers=parseShopeeOffers(payload([rawNode(),rawNode({itemId:9007199254740992}),rawNode({offerLink:'https://s.shopee.com.br.attacker.test/p'}),rawNode({imageUrl:'http://127.0.0.1/secret'}),rawNode({productLink:'https://shopee.com.br/product/8001/9999'}),rawNode({priceMax:'100'}),rawNode({ratingStar:9}),rawNode({commissionRate:100})]));
 assert.equal(offers.length,1);assert.equal(offers[0].price,180);
 const optional=parseShopeeOffers(payload([rawNode({ratingStar:undefined,sales:undefined,commissionRate:undefined,priceDiscountRate:undefined})]))[0];assert.equal(optional.rating,null);assert.equal(optional.sales,null);assert.equal(optional.commission,null);assert.equal(optional.reportedDiscount,null);
 assert.throws(()=>parseShopeeOffers({data:{productOfferV2:null}}),ShopeeApiError);
});
test('rate limits, GraphQL errors and timeouts are counted, sanitized and deferred without hidden retries',async()=>{
 for(const [http,code] of [[async()=>new Response('private response secret',{status:429,headers:{'Retry-After':'120'}}),'rate_limit'],[async()=>Response.json({errors:[{extensions:{code:10020},message:'Invalid Authorization Header'}]}),'auth'],[async()=>Response.json({errors:[{extensions:{code:10030},message:'Rate Limit'}]}),'rate_limit'],[async()=>Response.json({errors:[{message:'error [10000]: System Error',extensions:{code:10000,message:'System Error'}}]}),'provider'],[async()=>{throw new Error('secret token');},'provider']] as [typeof fetch,string][]){
  let calls=0;const finish:unknown[]=[];
  await assert.rejects(requestShopee({keyword:'ssd nvme',limit:10},{appId:'fixture',secret:'never-log-this',approved:true},async()=> 'id',async(...args)=>{finish.push(args);},async(...args)=>{calls++;return http(...args);}),e=>e instanceof ShopeeApiError&&e.code===code&&!/never-log|signature reflected|private response/.test(e.message));
  assert.equal(calls,1);assert.equal((finish[0] as string[])[1],code);
 }
});
test('the actual HTTP-200 System Error remains a transient failure, never empty successful inventory or a day-long schema error',async()=>{
 const outcomes:{state:string;retry:number}[]=[];
 await assert.rejects(requestShopee({keyword:'controle ps5',limit:1},{appId:'fixture',secret:'fixture',approved:true},async()=> 'reserved',async(_id,state,retry)=>{outcomes.push({state,retry});},async()=>Response.json({errors:[{message:'error [10000]: System Error',extensions:{code:10000,message:'System Error'}}]})),e=>e instanceof ShopeeApiError&&e.code==='provider');
 assert.deepEqual(outcomes,[{state:'provider',retry:60}]);assert.match(productOfferQuery({keyword:'controle ps5',limit:1}),/page:1,sortType:1,limit:1/);
 // Exact-item requests use the contract successfully exercised on the real API.
 assert.match(productOfferQuery({shopId:'764842647',itemId:'20343023230',limit:1}),/page:1,limit:1,itemId:20343023230,shopId:764842647/);
 assert.doesNotMatch(productOfferQuery({shopId:'8001',itemId:'9001',limit:1}),/keyword:|sortType:/);
});
test('gamer quality filters, balanced scoring and daily keyword rotation are deterministic and configurable',()=>{
 const config=defaultShopeeConfig(),good=mockShopeeOffer();assert.equal(assessShopeeOffer(good,config).eligible,true);
 for(const changes of [{name:'Vestido de festa'},{name:'Controle PS5 réplica'},{name:'Somente caixa controle Xbox'},{name:'Controle remoto ar condicionado'},{name:'Mouse gamer desconto 99%'},{rating:4.4},{sales:0},{rating:null},{image:''}])assert.equal(assessShopeeOffer({...good,...changes},config).eligible,false,JSON.stringify(changes));
 assert.ok(assessShopeeOffer(good,config).score>assessShopeeOffer({...good,rating:1,sales:0,commission:1},config).score);
 assert.notDeepEqual(dailyKeywords(config,'2026-11-11'),dailyKeywords(config,'2026-11-12'));assert.equal(dailyKeywords(config,'2026-11-11').length,4);
 assert.equal(shopeeConfigSchema.safeParse({...config,dailyLimit:6,times:['09:00','09:00']}).success,false);
 assert.equal(liveShopeeAllowed({...config,enabled:true,dryRun:false},{}),false);assert.equal(liveShopeeAllowed(config,{SHOPEE_AUTOMATION_LIVE:'true'}),false);
});
test('Bahia boundaries and future-only slots preserve four requested publication times',()=>{
 assert.equal(bahiaDay(new Date('2026-11-12T01:00:00Z')),'2026-11-11');
 assert.deepEqual(futureSlots(defaultShopeeConfig(),new Date('2026-11-11T12:01:00Z')).map(d=>d.toISOString()),['2026-11-11T15:30:00.000Z','2026-11-11T19:30:00.000Z','2026-11-11T23:30:00.000Z']);
});
test('local captions retain exact affiliate URLs, use ranges honestly and never derive an old price from a reported discount',()=>{
 const now=Date.now(),offer=mockShopeeOffer({checkedAt:new Date(now).toISOString()}),text=shopeeCaption(offer,now);
 assert.match(text,/Por R\$\s*180,00/);assert.ok(text.includes(offer.offerLink));assert.match(text,/Link de afiliado/);assert.ok(!/70%|De:|estoque|Pix/i.test(text));assert.ok(text.length<1024);
 assert.match(shopeeCaption({...offer,priceMax:250},now),/A partir de/);
 const stale={...offer,checkedAt:new Date(now-16*60000).toISOString()};assert.equal(priceCurrent(stale,now),false);assert.doesNotMatch(shopeeCaption(stale,now),/R\$|%/);
 assert.match(shopeeCaption({...offer,previousPrice:200,previousAt:new Date(now-86400000).toISOString()},now),/10% abaixo do preço observado/);
 assert.doesNotMatch(shopeeCaption({...offer,previousPrice:200,previousAt:new Date(now+86400000).toISOString()},now),/%/);
});
test('a ranked offer uses one sendPhoto message, caption below image; uncertain delivery never retries',async()=>{
 const o=mockShopeeOffer(),env={TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100123'},target={id:'-100123',key:'a'.repeat(64),title:'Fixture'},calls:unknown[]=[];
 const ids=await sendTelegramTo(env,target,shopeeCaption(o),o.image,async(url,init)=>{calls.push(url);assert.match(String(url),/sendPhoto$/);const body=JSON.parse(String(init?.body));assert.equal(body.photo,o.image);assert.equal(body.show_caption_above_media,false);assert.ok(body.caption.includes(o.offerLink));return Response.json({ok:true,result:{message_id:90,chat:{id:target.id}}});},async()=>{},async()=>{},{mediaMode:'photo'});
 assert.deepEqual(ids,['90']);assert.equal(calls.length,1);
 let uncertain=0;await assert.rejects(sendTelegramTo(env,target,shopeeCaption(o),o.image,async()=>{uncertain++;throw new Error('timeout');}),e=>e instanceof TelegramFailure&&e.outcome==='uncertain');assert.equal(uncertain,1);
});
