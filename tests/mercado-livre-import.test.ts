import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mercadoLivreIdentity,mercadoLivreUrl} from '../src/lib/mercado-livre-link';
import {resolveMercadoLivreLink} from '../src/server/mercado-livre/resolve-link';
import {associateMercadoLivreAffiliate} from '../src/server/mercado-livre/affiliate-link';
import {importMercadoLivreData,type MercadoLivreRequest} from '../src/server/mercado-livre/import-core';
import {requestMercadoLivreImport} from '../src/server/mercado-livre/import-http';
import {productKey,productSchema,publicationError} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
import {captionError} from '../src/lib/caption-editor';
const url='https://produto.mercadolivre.com.br/MLB-3574638387-capa-de-vidro-_JM';
const response=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers});
const item={id:'MLB3574638387',title:'Capa para celular',currency_id:'BRL',price:49.9,status:'active',available_quantity:2,pictures:[{secure_url:'https://http2.mlstatic.com/fixture.jpg'}],attributes:[{id:'BRAND',value_name:'Marca do contrato'}]};
test('listing IDs, catalog IDs and selected sellers remain different identities',()=>{
 assert.equal(mercadoLivreIdentity(url+'#polycard=x').itemId,'MLB3574638387');
 assert.equal(mercadoLivreIdentity('https://www.mercadolivre.com.br/modelo/p/MLB12345678').itemId,null);
 assert.equal(mercadoLivreIdentity('https://www.mercadolivre.com.br/modelo/p/MLB12345678?wid=MLB3574638387').itemId,'MLB3574638387');
 assert.equal(mercadoLivreIdentity('https://www.mercadolivre.com.br/MLB123456789012-produto').itemId,'MLB123456789012');
 assert.equal(mercadoLivreIdentity('https://www.mercadolivre.com.br/capa/up/MLBU1234567890').userProductId,'MLBU1234567890');
 assert.equal(mercadoLivreIdentity('https://www.mercadolivre.com.br/capa/up/MLBU1234567890').itemId,null);
 assert.equal(mercadoLivreIdentity('https://meli.la/fixture?wid=MLB3574638387').itemId,null);
 for(const bad of ['http://meli.la/x','https://meli.la.evil.test/x','https://user:pass@meli.la/x','https://127.0.0.1/x','https://api.mercadolibre.com/items/MLB12345','https://meli.la:8443/x'])assert.throws(()=>mercadoLivreUrl(bad));
});
test('short links follow only bounded official redirects without cookies or arbitrary requests',async()=>{
 const calls:string[]=[];const http=(async(input,init)=>{calls.push(String(input));assert.equal(init?.method,'HEAD');assert.equal(init?.redirect,'manual');assert.equal(init?.headers,undefined);return new Response(null,{status:302,headers:{location:calls.length===1?'https://www.mercadolivre.com.br/sec/fixture':url}});}) as typeof fetch;
 assert.equal((await resolveMercadoLivreLink('https://meli.la/fixture',http)).itemId,'MLB3574638387');assert.equal(calls.length,2);
 let requests=0;await assert.rejects(resolveMercadoLivreLink('https://meli.la/fixture',(async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://169.254.169.254/secrets'}});}) as typeof fetch));assert.equal(requests,1);
 requests=0;await assert.rejects(resolveMercadoLivreLink('https://meli.la/fixture',(async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://meli.la/fixture'}});}) as typeof fetch));assert.equal(requests,1);
});
test('normal import keeps affiliation pending, records official price and never invents a discount',async()=>{
 const calls:string[]=[],request:MercadoLivreRequest=async(path,resource)=>{calls.push(path);return {data:resource==='item'?item:{amount:39.9,regular_amount:49.9,currency_id:'BRL'},check:{resource,state:'available',httpStatus:200}};};
 const result=await importMercadoLivreData({inputUrl:url,resolvedUrl:url,operation:'celulares'},request),p=result.product;
 assert.equal(p.price,39.9);assert.equal(p.previousPrice,null);assert.equal(p.previousVerified,false);assert.equal(p.source?.referenceAmount,49.9);assert.equal(p.checkedAt,null);assert.equal(p.affiliateUrl,'');assert.equal(p.mercadoLivreImport?.affiliateState,'pending');assert.equal(p.visualDetails?.brand,'Marca do contrato');
 assert.equal(calls.length,2);assert.ok(publicationError(p));assert.equal(captionError(formatCaption(p,'celulares'),p),null);
 assert.equal(productKey(p),productKey({...p,originalUrl:'https://www.mercadolivre.com.br/MLB3574638387-outro-titulo'}));
});
test('a refused price resource preserves name, photo, advertised price and unconfirmed variant',async()=>{
 const result=await importMercadoLivreData({inputUrl:url,resolvedUrl:url,operation:'celulares'},async(path,resource)=>({data:resource==='item'?{...item,variations:[{id:1,price:51.9,attribute_combinations:[{value_name:'Azul'}]},{id:2,price:55.9,attribute_combinations:[{value_name:'Preta'}]}]}:null,check:{resource,state:resource==='item'?'available':'denied',httpStatus:resource==='item'?200:403}}));
 assert.equal(result.product.name,item.title);assert.equal(result.product.price,49.9);assert.equal(result.product.image,item.pictures[0].secure_url);assert.equal(result.product.needsHumanReview,true);assert.deepEqual(result.product.visualDetails?.uncertainFields,['selectedVariant']);assert.equal(result.product.checkedAt,null);assert.match(result.message,/recusou/);
 assert.deepEqual(result.variants?.map(v=>({id:v.id,label:v.label,price:v.price})),[{id:'1',label:'Azul',price:51.9},{id:'2',label:'Preta',price:55.9}]);
});
test('missing price and item 403 create a usable partial draft without fabricated values or price calls',async()=>{
 for(const allowed of [true,false]){let calls=0;const result=await importMercadoLivreData({inputUrl:url,resolvedUrl:url,operation:'dropou'},async(path,resource)=>{calls++;return {data:allowed?{...item,price:null}:null,check:{resource,state:allowed&&resource==='item'?'available':'denied',httpStatus:allowed&&resource==='item'?200:403}};});
 assert.equal(result.product.price,0);assert.equal(result.product.affiliateUrl,'');assert.equal(result.product.inStock,allowed?true:null);assert.equal(result.product.name,allowed?item.title:'');assert.equal(calls,allowed?2:1);assert.ok(result.missing.includes('preço'));
 }
});
test('catalog entities provide identity and images without becoming seller prices or stock',async()=>{
 const catalog='https://www.mercadolivre.com.br/modelo/p/MLB12345678';let calls=0;
 const result=await importMercadoLivreData({inputUrl:catalog,resolvedUrl:catalog,operation:'dropou'},async(path,resource)=>{calls++;assert.equal(path,'/products/MLB12345678');return {data:{...item,id:'MLB12345678',name:'Modelo de catálogo',title:undefined,price:9},check:{resource,state:'available'}};});
 assert.equal(result.product.name,'Modelo de catálogo');assert.equal(result.product.price,0);assert.equal(result.product.inStock,null);assert.equal(calls,1);
});
test('affiliate association preserves attribution exactly, rejects another listing and never claims commissions',async()=>{
 const affiliate='https://meli.la/fixture?tracking=original%2Fab';const http=(async()=>new Response(null,{status:302,headers:{location:url+'?matt_tool=123&matt_word=fixture'}})) as typeof fetch;
 const result=await associateMercadoLivreAffiliate(affiliate,url,http);assert.equal(result.url,affiliate);assert.equal(result.state,'informed');assert.equal(result.matchesProduct,true);assert.match(result.message,/apuradas/);
 await assert.rejects(associateMercadoLivreAffiliate(affiliate,url,(async()=>new Response(null,{status:302,headers:{location:'https://produto.mercadolivre.com.br/MLB-9999999999-outro-_JM'}})) as typeof fetch),/outro anúncio/);
 const unknown=await associateMercadoLivreAffiliate(affiliate,url,(async()=>new Response(null,{status:403})) as typeof fetch);assert.equal(unknown.matchesProduct,null);assert.equal(unknown.state,'informed');
});
test('official HTTP diagnostics sanitize errors, stop after a denial and respect rate limits',async()=>{
 let calls=0;const denied=await requestMercadoLivreImport('/items/MLB3574638387','item','private-test-token',(async(input,init)=>{calls++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer private-test-token');return response({error:'access_denied',message:'private-test-token'},403,{'x-request-id':'244e026a-547c-4ca6-ad0e-3b8995e9d61a'});}) as typeof fetch);
 assert.equal(calls,1);assert.equal(denied.seconds,3600);assert.equal(denied.check.state,'denied');assert.doesNotMatch(JSON.stringify(denied),/private-test-token/);
 const limit=await requestMercadoLivreImport('/items/MLB3574638387','item','fixture',(async()=>response({},429,{'retry-after':'120'})) as typeof fetch);assert.equal(limit.seconds,120);
 const catalog=await requestMercadoLivreImport('/products/search?status=active&site_id=MLB&q=controle&limit=5','catalog','fixture',(async()=>response({results:[{id:'MLB12345678',name:'Controle',seller_private:'do not store'}]})) as typeof fetch);assert.doesNotMatch(JSON.stringify(catalog),/do not store/);
 await assert.rejects(requestMercadoLivreImport('https://evil.test/','item','fixture'));
});
