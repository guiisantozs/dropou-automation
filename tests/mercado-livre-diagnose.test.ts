import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseMercadoLivre} from '../src/server/mercado-livre/diagnose';
const input={itemId:'MLB123456789',clientId:'123'};
test('diagnosis distinguishes known ID and modern bulk from category/keyword/catalog permission',async()=>{
 const paths:string[]=[];const result=await diagnoseMercadoLivre('synthetic-token',input,['synthetic-secret'],async(url,init)=>{
  const path=new URL(String(url)).pathname;paths.push(String(url));assert.equal(init?.redirect,'error');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer synthetic-token');
  if(path==='/users/me')return Response.json({id:55,nickname:'test'});
  if(path==='/applications/123')return Response.json({active:true,sandbox_mode:false,site_id:'MLB',scopes:['read','offline_access'],client_secret:'PRIVATE',access_token:'PRIVATE'});
  if(path==='/users/55/applications')return Response.json([{app_id:999,scopes:['write']},{app_id:123,scopes:['read']}]);
  if(path==='/items/bulk')return Response.json([{id:input.itemId,status_code:200,body:{id:input.itemId,title:'Synthetic contract',price:123}}]);
  if(path.endsWith('/sale_price'))return Response.json({amount:100,currency_id:'BRL'});
  if(path==='/items/'+input.itemId)return Response.json({id:input.itemId,title:'Synthetic contract',price:123});
  return Response.json({error:'forbidden',message:'forbidden'},{status:403});
 });
 assert.equal(result.capabilities.knownItem,true);assert.equal(result.capabilities.bulk,true);assert.equal(result.capabilities.currentPrice,true);
 assert.equal(result.capabilities.keywordSearch,false);assert.equal(result.capabilities.categorySearch,false);assert.equal(result.capabilities.catalogSearch,false);assert.equal(result.checks.keywordSearch.httpStatus,403);assert.equal(result.checks.bulk.innerStatus,200);
 assert.ok(paths.some(p=>p.includes('/items/bulk?ids=')));assert.ok(!paths.some(p=>p.includes('/items?ids=')));assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.deepEqual(result.grantedScopes,['read']);
});
test('bulk HTTP 200 with inner 403 is denied, never interpreted as product access',async()=>{
 const result=await diagnoseMercadoLivre('synthetic-token',input,[],async url=>{
  const path=new URL(String(url)).pathname;if(path==='/users/me')return Response.json({id:55});
  if(path==='/items/bulk')return Response.json([{id:input.itemId,status_code:403,body:{error:'forbidden',message:'synthetic-token APP_USR-private TG-private'}}]);
  return Response.json({error:'forbidden',message:'forbidden'},{status:403});
 });
 assert.equal(result.capabilities.bulk,false);assert.equal(result.checks.bulk.httpStatus,200);assert.equal(result.checks.bulk.innerStatus,403);assert.equal(result.checks.bulk.state,'unavailable');assert.ok(!JSON.stringify(result).includes('synthetic-token'));assert.equal(result.checks.salePrice,undefined);
});
test('no invented ID, no legacy bulk parsing and no calls after failed authentication',async()=>{
 let calls=0;await assert.rejects(diagnoseMercadoLivre('synthetic',{...input,itemId:'MLB123/evil'},[],async()=>{calls++;throw Error();}));assert.equal(calls,0);
 const failed=await diagnoseMercadoLivre('synthetic',input,[],async()=>{calls++;return Response.json({error:'invalid_token'},{status:401});});assert.equal(calls,1);assert.equal(failed.capabilities.knownItem,false);
 const without=await diagnoseMercadoLivre('synthetic',{clientId:'123'},[],async url=>String(url).endsWith('/users/me')?Response.json({id:55}):Response.json({error:'forbidden'},{status:403}));assert.equal(without.itemId,null);assert.equal(without.checks.item.state,'pending');
 const legacy=await diagnoseMercadoLivre('synthetic',input,[],async url=>String(url).endsWith('/users/me')?Response.json({id:55}):String(url).includes('/items/bulk?')?Response.json([{id:input.itemId,code:200,body:{id:input.itemId,title:'Old contract'}}]):Response.json({error:'forbidden'},{status:403}));assert.equal(legacy.checks.bulk.code,'invalid_response');assert.equal(legacy.capabilities.bulk,false);
});
