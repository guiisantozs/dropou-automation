import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeMercadoLivre} from '../src/server/mercado-livre/probe';
test('integration probe: account success does not imply search permission; preserves safe real error',async()=>{
 const calls:string[]=[];const result=await probeMercadoLivre('synthetic-token',[],async input=>{const url=String(input);calls.push(url);return url.endsWith('/users/me')?Response.json({id:123,nickname:'contract-account',email:'private@example.com'}):Response.json({error:'forbidden',message:'At least one policy returned UNAUTHORIZED'},{status:403});});
 assert.equal(result.oauth.state,'connected');assert.equal(result.search.state,'unavailable');assert.equal(result.search.httpStatus,403);assert.equal(result.search.code,'forbidden');assert.equal(result.search.message,'At least one policy returned UNAUTHORIZED');assert.equal(calls.length,2);assert.ok(calls[1].includes('/sites/MLB/search?'));assert.ok(!JSON.stringify(result).includes('private@example.com'));
});
test('integration probe: no search after failed authentication, no credential reflection',async()=>{
 let calls=0;const result=await probeMercadoLivre('synthetic-access',['synthetic-secret'],async()=>{calls++;return Response.json({error:'invalid_token',message:'synthetic-access synthetic-secret APP_USR-private TG-private Bearer private'},{status:401});});
 assert.equal(calls,1);assert.equal(result.oauth.httpStatus,401);assert.equal(result.search.state,'pending');const text=JSON.stringify(result);for(const secret of ['synthetic-access','synthetic-secret','APP_USR-private','TG-private','Bearer private'])assert.ok(!text.includes(secret));
});
test('integration probe: valid search response required; timeout does not claim connected',async()=>{
 const me=()=>Response.json({id:123,nickname:'contract-account'});
 const invalid=await probeMercadoLivre('synthetic',[],async input=>String(input).endsWith('/users/me')?me():Response.json({not_results:[]}));assert.equal(invalid.search.state,'error');
 const valid=await probeMercadoLivre('synthetic',[],async input=>String(input).endsWith('/users/me')?me():Response.json({results:[]}));assert.equal(valid.search.state,'available');
 const failed=await probeMercadoLivre('synthetic',[],async()=>{throw new Error('private transport failure');});assert.equal(failed.oauth.state,'error');assert.equal(failed.search.state,'pending');assert.ok(!JSON.stringify(failed).includes('private transport failure'));
});
