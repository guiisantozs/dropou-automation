// Actual route functions, synthetic Auth/REST only. Never loads .env or permits external fetch.
import assert from 'node:assert/strict';
import {inboxFixture,extensionFixtureUrl} from '../../tests/fixtures/ml-extension';
import {POST,GET} from '../../src/app/api/mercado-livre/extension/route';
const owner='90000000-0000-4000-8000-000000000001',member='90000000-0000-4000-8000-000000000002';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://extension-fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-public';process.env.SUPABASE_SECRET_KEY='fixture-server';process.env.MERCADO_LIVRE_ADMIN_USER_IDS='';
const origin='https://dropou-automation.vercel.app',rows:any[]=[];let redirects=0,mismatch=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input)),headers=new Headers(init.headers),token=headers.get('authorization')||'',respond=(data:unknown)=>Response.json(data);
 if(url.hostname==='meli.la'){redirects++;assert.equal(init.method,'HEAD');assert.equal(headers.get('cookie'),null);return new Response(null,{status:302,headers:{Location:mismatch?extensionFixtureUrl.replace('1234567890','9999999999'):extensionFixtureUrl}});}
 if(url.origin!=='https://extension-fixture.supabase.co')throw Error('Fixture blocked network');
 if(url.pathname==='/auth/v1/user')return respond({id:token.includes('fixture-member')?member:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',created_at:new Date().toISOString()});
 if(url.pathname.endsWith('/rpc/dropou_access_context'))return respond({owner,actor:token.includes('fixture-member')?member:owner,admin:!token.includes('fixture-member'),brands:token.includes('fixture-member')?['tenis']:['dropou','tenis','beleza']});
 if(url.pathname.endsWith('/telegram_dispatch_config'))return respond({owner_ids:[owner],automation_enabled:false});
 if(url.pathname.endsWith('/operation_link_inbox'))return new Response(null,{status:201});
 if(url.pathname.endsWith('/products'))return respond([]);
 if(url.pathname.endsWith('/ml_extension_inbox')){
  if(init.method==='POST'){const body=JSON.parse(String(init.body));if(!rows.some(r=>r.request_id===body.request_id))rows.push({id:crypto.randomUUID(),...body,state:'pending',product_id:null});return new Response(null,{status:201});}
  const matches=rows.filter(r=>(!url.searchParams.has('request_id')||url.searchParams.get('request_id')==='eq.'+r.request_id)&&(!url.searchParams.has('id')||url.searchParams.get('id')==='eq.'+r.id));return respond(headers.get('accept')?.includes('vnd.pgrst.object')?matches[0]:matches);
 }
 if(url.pathname.endsWith('/rpc/dropou_ml_extension_prepare')){const body=JSON.parse(String(init.body));assert.equal(body.p_owner,owner);assert.equal(body.p_brand,'dropou');assert.equal(body.p_product.mercadoLivreImport.affiliateConfirmed,true);return respond({product:body.p_product,existing:false});}
 throw Error('Unexpected fixture request '+url.pathname);
};
const call=(method:string,body?:unknown,brand='dropou',token='fixture-owner',requestOrigin=origin)=>new Request(origin+'/api/mercado-livre/extension',{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'x-dropou-brand':brand,Origin:requestOrigin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
try{
 assert.equal((await GET(call('GET',undefined,'dropou',''))).status,401);
 assert.equal((await POST(call('POST',{},'dropou','fixture-member'))).status,403);
 assert.equal((await POST(call('POST',{},'beleza'))).status,403);
 assert.equal((await POST(call('POST',{},'dropou','fixture-owner','https://evil.test'))).status,403);
 const payload={requestId:crypto.randomUUID(),originalUrl:extensionFixtureUrl,candidateUrl:'https://meli.la/fixture',itemId:'MLB1234567890',review:'candidate'};
 assert.equal((await POST(call('POST',{...payload,candidateUrl:'https://evil.test/link'}))).status,400);assert.equal(redirects,0);
 mismatch=true;assert.equal((await POST(call('POST',payload))).status,400);assert.equal(rows.length,0);mismatch=false;
 let response=await POST(call('POST',payload));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const row=await response.json();assert.equal(row.draft.price,0);assert.equal(row.draft.inStock,null);assert.equal(row.state,'pending');const requests=redirects;
 response=await POST(call('POST',payload));assert.equal((await response.json()).id,row.id);assert.equal(redirects,requests);assert.equal(rows.length,1);
 assert.equal((await POST(call('POST',{...payload,candidateUrl:'https://meli.la/other'}))).status,400);
 assert.equal((await POST(call('POST',{action:'prepare',review:{id:row.id,confirmed:false,inStock:true}}))).status,400);
 response=await POST(call('POST',{action:'prepare',review:{id:row.id,confirmed:true,inStock:true,name:'Nome informado pelo usuário',price:99.9,image:inboxFixture().draft.image}}));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal((await response.json()).product.affiliateUrl,payload.candidateUrl);
 console.log('11 HTTP checks passed; no external network or publication methods.');
}finally{globalThis.fetch=originalFetch;}
