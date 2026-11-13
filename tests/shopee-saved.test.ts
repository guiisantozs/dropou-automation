import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shopeeProductLink} from '../src/lib/shopee-saved';
import {resolveShopeeProductLink} from '../src/server/shopee/resolve-link';
import {productBatchQuery,parseShopeeBatch,requestShopeeOperation,ShopeeApiError} from '../src/server/shopee/client';
const node=(itemId:string,shopId='123')=>({itemId,shopId,productName:'Controle PC Bluetooth',imageUrl:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/affiliate-'+itemId,priceMin:'149.90',priceMax:'149.90',ratingStar:'4.8',sales:1000,commissionRate:'0.08',priceDiscountRate:15});
test('ordinary Shopee links deduplicate product identity; non-Shopee hosts and non-product links are rejected',()=>{
 const a=shopeeProductLink('https://shopee.com.br/Controle-PC-i.00123.456?utm_source=other#share'),b=shopeeProductLink('https://shopee.com.br/product/123/456');assert.equal(a.canonical,b.canonical);assert.equal(a.shopId,'123');assert.equal(a.itemId,'456');
 for(const url of ['https://br.shp.ee/shareCode','https://s.shopee.com.br/shareCode','https://shope.ee/shareCode'])assert.equal(shopeeProductLink(url).itemId,null);
 for(const url of ['http://shopee.com.br/product/123/456','https://shopee.com.br.evil.test/product/123/456','https://evil.shopee.com.br/product/123/456','https://user:secret@shopee.com.br/product/123/456','https://shopee.com.br:8443/product/123/456','https://127.0.0.1/product/123/456','https://shopee.com.br/search?keyword=ssd','https://meli.la/test','https://shopee.com.br/product/0/123','https://shopee.com.br/product/123/99999999999999999999'])assert.throws(()=>shopeeProductLink(url),/./,url);
});
test('share links follow bounded HEAD redirects; external targets and direct URLs never trigger arbitrary fetches',async()=>{
 const seen:string[]=[],http=(async(url,init)=>{assert.equal(init?.method,'HEAD');assert.equal(init?.redirect,'manual');seen.push(String(url));return new Response(null,{status:302,headers:{location:'https://shopee.com.br/Controle-i.123.456'}});}) as typeof fetch;
 assert.equal((await resolveShopeeProductLink('https://br.shp.ee/share',http)).itemId,'456');assert.equal(seen.length,1);await resolveShopeeProductLink('https://shopee.com.br/product/123/456',http);assert.equal(seen.length,1);
 let calls=0;await assert.rejects(resolveShopeeProductLink('https://br.shp.ee/share',(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});}) as typeof fetch),/oficiais/);assert.equal(calls,1);
 calls=0;await assert.rejects(resolveShopeeProductLink('https://br.shp.ee/share',(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://br.shp.ee/loop'}});}) as typeof fetch),/link completo/);assert.equal(calls,3);
});
test('five-product batches preserve official affiliate URLs, images, prices and identity; missing data is never invented',()=>{
 const items=[{shopId:'123',itemId:'456'},{shopId:'123',itemId:'789'}],query=productBatchQuery(items);assert.match(query,/p0:productOfferV2/);assert.match(query,/p1:productOfferV2/);assert.match(query,/itemId:456/);assert.throws(()=>productBatchQuery([{shopId:'123',itemId:'1){evil}'}]));assert.throws(()=>productBatchQuery(Array.from({length:6},()=>items[0])));
 const result=parseShopeeBatch({data:{p0:{nodes:[node('456')]},p1:{nodes:[]}}},items);assert.equal(result[0]?.offerLink,'https://s.shopee.com.br/affiliate-456');assert.equal(result[0]?.image,'https://down-br.img.susercontent.com/file/fixture');assert.equal(result[0]?.price,149.9);assert.equal(result[1],null);assert.equal(parseShopeeBatch({data:{p0:{nodes:[node('999')]}}},[items[0]])[0],null);
});
test('batch lookup reserves one HTTP request, respects the budget and settles provider failures without retries',async()=>{
 const items=[{shopId:'123',itemId:'456'}],query=productBatchQuery(items),finished:any[]=[];let reserves=0,calls=0;
 const creds={appId:'fixture',secret:'fixture-secret',approved:true},http=(async(_url,init)=>{calls++;assert.equal(JSON.parse(String(init?.body)).query,query);assert.ok(String((init?.headers as Record<string,string>).Authorization).startsWith('SHA256 Credential=fixture'));return Response.json({data:{p0:{nodes:[node('456')]}}});}) as typeof fetch;
 const result=await requestShopeeOperation(query,creds,async()=>{reserves++;return 'fixture';},async(...args)=>{finished.push(args);},raw=>parseShopeeBatch(raw,items),http);assert.equal(result.length,1);assert.equal(calls,1);assert.equal(reserves,1);assert.deepEqual(finished,[['fixture','ok',0]]);
 await assert.rejects(requestShopeeOperation(query,creds,async()=>null,async()=>{},raw=>raw,http),(e:any)=>e instanceof ShopeeApiError&&e.code==='budget');assert.equal(calls,1);
 await assert.rejects(requestShopeeOperation(query,creds,async()=>'error',async(...args)=>{finished.push(args);},raw=>raw,(async()=>Response.json({errors:[{message:'System Error',extensions:{code:10000}}]})) as typeof fetch),(e:any)=>e.code==='provider');assert.equal(finished[1][1],'provider');
});
