import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {activeAccessToken,authorizationUrl,cipherKey,Connection,hash,newHandshake,redirectUri,requestTokens,seal,TokenSet,TokenStore,unseal} from '../src/server/mercado-livre/oauth-core';

const tokens:TokenSet={access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:21600,user_id:123};
test('OAuth: HTTPS static redirect, independent state, browser nonce and PKCE S256',()=>{
 assert.equal(redirectUri('https://example.com'),'https://example.com/api/oauth/mercado-livre/callback');
 for(const origin of ['http://example.com','https://localhost','https://example.com/path','https://example.com?next=evil','https://user:pass@example.com'])assert.throws(()=>redirectUri(origin));
 const h=newHandshake(),other=newHandshake();assert.equal(h.challenge,hash(h.verifier));assert.match(h.verifier,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(h.state,other.state);assert.notEqual(h.state,h.browser);
 const u=new URL(authorizationUrl('123',redirectUri('https://example.com'),h.state,h.challenge));
 assert.equal(u.origin,'https://auth.mercadolivre.com.br');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('state'),h.state);assert.equal(u.searchParams.has('client_secret'),false);assert.equal(u.searchParams.has('code_verifier'),false);
});
test('OAuth vault: authenticated encryption binds ciphertext to owner and account',()=>{
 const key=cipherKey(randomBytes(32).toString('base64')),aad='connection:owner:123';
 const encrypted=seal(JSON.stringify(tokens),key,aad);assert.ok(!encrypted.includes(tokens.refresh_token));assert.equal(unseal(encrypted,key,aad),JSON.stringify(tokens));
 assert.notEqual(seal('same',key,aad),seal('same',key,aad));assert.throws(()=>unseal(encrypted,key,'connection:other:123'));assert.throws(()=>unseal(encrypted,randomBytes(32),aad));assert.throws(()=>unseal(encrypted.slice(0,-2)+'xx',key,aad));assert.throws(()=>cipherKey('invalid'));
});
function fixture(){
 const key=randomBytes(32);let c:Connection={owner_id:'owner',ml_user_id:'123',encrypted_tokens:seal(JSON.stringify(tokens),key,'connection:owner:123'),expires_at:new Date(0).toISOString(),status:'active',version:'v1',lock_id:null,refresh_started_at:null};
 const store:TokenStore={async load(){return {...c};},async claim(_,v,lock){if(c.version!==v||c.status!=='active')return false;c={...c,status:'refreshing',lock_id:lock};return true;},async rotate(_,v,lock,t){if(c.version!==v||c.lock_id!==lock)return false;c={...c,encrypted_tokens:seal(JSON.stringify(t),key,'connection:owner:123'),status:'active',version:'v2',expires_at:new Date(Date.now()+t.expires_in*1000).toISOString(),lock_id:null};return true;},async fail(_,v,lock,status){if(c.version===v&&c.lock_id===lock)c={...c,status,lock_id:null};}};
 return {key,store,current:()=>c};
}
test('OAuth refresh: concurrent requests exchange a single-use refresh token only once',async()=>{
 const f=fixture();let calls=0;const refreshed={...tokens,access_token:'rotated-access-token',refresh_token:'rotated-refresh-token'};
 const http:typeof fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://api.mercadolibre.com/oauth/token');assert.equal(init?.redirect,'error');const form=new URLSearchParams(String(init?.body));assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),tokens.refresh_token);await new Promise(r=>setTimeout(r,10));return Response.json(refreshed);};
 const results=await Promise.allSettled([activeAccessToken('owner',f.store,f.key,{id:'123',secret:'synthetic'},http),activeAccessToken('owner',f.store,f.key,{id:'123',secret:'synthetic'},http)]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.current().status,'active');assert.equal(f.current().version,'v2');
 assert.equal(await activeAccessToken('owner',f.store,f.key,{id:'123',secret:'synthetic'},http),refreshed.access_token);assert.equal(calls,1);
 assert.equal(JSON.parse(unseal(f.current().encrypted_tokens,f.key,'connection:owner:123')).refresh_token,refreshed.refresh_token);
});
test('OAuth refresh: invalid grant and uncertain exchange require reconnect without retry',async()=>{
 for(const [status,http] of [['reconnect_required',async()=>Response.json({error:'invalid_grant',secret:'do not expose'},{status:400})],['refresh_uncertain',async()=>{throw new Error('network');}]] as const){
  const f=fixture();let calls=0;const wrapped:typeof fetch=async()=>{calls++;return http();};
  await assert.rejects(activeAccessToken('owner',f.store,f.key,{id:'123',secret:'synthetic'},wrapped));assert.equal(f.current().status,status);
  await assert.rejects(activeAccessToken('owner',f.store,f.key,{id:'123',secret:'synthetic'},wrapped));assert.equal(calls,1);
 }
 await assert.rejects(requestTokens(new URLSearchParams(),async()=>Response.json({error:'invalid_client',access_token:'PRIVATE'},{status:401})),e=>e instanceof Error&&!e.message.includes('PRIVATE'));
});
test('OAuth database: service-only vault, one-time state consumption and version lock',async()=>{
 const db=new PGlite();const owner='10000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role,anon,authenticated;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');`);
  await db.exec(readFileSync('supabase/mercado-livre-oauth.sql','utf8'));
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);for(const table of ['mercado_livre_connections','mercado_livre_oauth_flows']){await assert.rejects(db.query(`select * from ${table}`),/permission denied/);await assert.rejects(db.query(`delete from ${table}`),/permission denied/);}await db.exec('reset role');}
  await db.exec('set role service_role');
  await db.query("insert into mercado_livre_oauth_flows(state_hash,owner_id,browser_hash,encrypted_verifier,expires_at) values('state',$1,'browser','encrypted',now()+interval '10 minutes')",[owner]);
  const consume=(browser:string)=>db.query("delete from mercado_livre_oauth_flows where state_hash='state' and browser_hash=$1 and expires_at>now() returning owner_id",[browser]);
  assert.equal((await consume('wrong-browser')).rows.length,0);assert.equal((await consume('browser')).rows.length,1);assert.equal((await consume('browser')).rows.length,0);
  await db.query("insert into mercado_livre_oauth_flows(state_hash,owner_id,browser_hash,encrypted_verifier,expires_at) values('state',$1,'browser','encrypted',now()-interval '1 second')",[owner]);
  assert.equal((await consume('browser')).rows.length,0);
  await db.query("insert into mercado_livre_connections(owner_id,ml_user_id,encrypted_tokens,expires_at,status) values($1,'123','encrypted',now(),'active')",[owner]);
  const claim=()=>db.query("update mercado_livre_connections set status='refreshing',lock_id='lock' where owner_id=$1 and status='active' returning owner_id",[owner]);
  assert.equal((await claim()).rows.length,1);assert.equal((await claim()).rows.length,0);
 }finally{await db.close();}
});
