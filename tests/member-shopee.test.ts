import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import type {SupabaseClient} from '@supabase/supabase-js';
import {memberClassification,memberFingerprint,memberCurationProfiles} from '../src/lib/member-curation';
import {channelShopeeConfig} from '../src/lib/channel-shopee-config';
import {assessShopeeOffer,type ShopeeOffer} from '../src/lib/shopee-automation';
import {curatedDiscovery} from '../src/lib/shopee-curation';
import {operationIntegrationUnavailable,workspaceAdminRequired} from '../src/lib/operator-access';
import {requestShopee,parseShopeeOffers} from '../src/server/shopee/client';
import {requestProductOffers} from '../src/server/shopee/product-offers';
import {searchChannel} from '../src/server/shopee/on-demand';
import {resolveShopeeProductLink} from '../src/server/shopee/resolve-link';
import {resolveSavedShopeeProducts} from '../src/server/shopee/saved-products';
import {shopeeProductLink} from '../src/lib/shopee-saved';
import {validShopeeAffiliateLink} from '../src/lib/shopee-affiliate';
import {shopeeProduct} from '../src/lib/shopee-product';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
const env={SHOPEE_AFFILIATE_APP_ID:'fixture-admin',SHOPEE_AFFILIATE_SECRET:'fixture-server-only',SHOPEE_AFFILIATE_APPROVED:'true'};
const offer=(name='Kit maquiagem batom feminino',extra:Partial<ShopeeOffer>={}):ShopeeOffer=>({shopId:'123',itemId:'456',name,price:39.9,priceMax:39.9,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/admin-fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:1200,commission:.1,reportedDiscount:null,checkedAt:new Date().toISOString(),...extra});
const node=(o=offer())=>({shopId:o.shopId,itemId:o.itemId,productName:o.name,priceMin:o.price,priceMax:o.priceMax,imageUrl:o.image,offerLink:o.offerLink,productLink:o.productLink,ratingStar:o.rating,sales:o.sales,commissionRate:o.commission,priceDiscountRate:o.reportedDiscount});

for(const [brand,names] of Object.entries({beleza:['Kit maquiagem batom feminino','Perfume feminino 100ml','Sérum facial skincare','Máscara de cílios','Shampoo máscara capilar','Kit manicure unhas'],casa:['Vaso decorativo minimalista','Flores artificiais decoração','Tapete sala','Organizador banheiro','Abajur luminária quarto','Cortina sala'],natal:['Árvore de Natal 150cm','Miniárvore Natal','Kit bolas natalinas','Pisca-pisca Natal','Guirlanda Papai Noel decorativo','Capas de almofadas natalinas']}))test('niche selection: '+brand,()=>{
 const operation=brand as keyof typeof memberCurationProfiles,config=channelShopeeConfig({},brand);
 for(const name of names){assert.equal(memberClassification(name,operation)?.relevant,true,name);assert.equal(assessShopeeOffer(offer(name),config,[],operation).recommended,true,name);}
 for(const name of ['Furadeira automotiva','Controle Xbox gamer','Smartphone Samsung','Camiseta feminina Natal','Presente de Natal perfume feminino','Geladeira cozinha','Pisca pisca decoração festa','Batom brinquedo boneca'])if(!names.includes(name)){
  const expected=brand==='beleza'&&name==='Presente de Natal perfume feminino';
  if(!expected)assert.equal(memberClassification(name,operation)?.relevant,false,brand+': '+name);
 }
});

test('missing evidence stays null; reported discounts and commissions cannot inflate member recommendations',()=>{
 const config=channelShopeeConfig({},'beleza'),empty=assessShopeeOffer(offer(undefined,{sales:null,rating:null,reportedDiscount:90}),config,[],'beleza');
 assert.equal(empty.components.sales,null);assert.equal(empty.components.rating,null);assert.equal(empty.components.price,null);assert.equal(empty.recommended,false);assert.equal(empty.eligible,false);
 const one=assessShopeeOffer(offer(undefined,{sales:null,rating:4.8}),config,[],'beleza');assert.equal(one.recommended,true);assert.equal(one.components.sales,null);assert.match(one.warnings.join(' '),/não disponibilizadas/);
 const a=assessShopeeOffer(offer(undefined,{reportedDiscount:0,commission:0}),config,[],'beleza'),b=assessShopeeOffer(offer(undefined,{reportedDiscount:99,commission:1}),config,[],'beleza');assert.equal(a.score,b.score);assert.equal(b.discountSource,'reported');assert.equal(b.observedDiscount,null);
 assert.equal(assessShopeeOffer(offer(undefined,{priceMax:80}),config,[],'beleza').recommended,false);
 assert.equal(assessShopeeOffer(offer(undefined,{price:9000,priceMax:9000}),config,[],'beleza').recommended,false);
 assert.notEqual(memberFingerprint('Batom rosa 10ml'),memberFingerprint('Batom vermelho 20ml'));
});

test('member cache is reclassified, deduplicated and respects prior decisions without admitting another niche',()=>{
 const data=offer(),row={id:'a',shop_id:'123',item_id:'456',data,decision:'found'};
 const config=channelShopeeConfig({},'beleza');
 const rows=curatedDiscovery([row,{...row,id:'b'}, {...row,id:'c',data:offer('Vaso decorativo')}],[],new Set(),config,[],'beleza');assert.equal(rows.length,1);
 assert.equal(curatedDiscovery([row,{...row,id:'reject',decision:'rejected'}],[],new Set(),config,[],'beleza').length,0);
 assert.equal(curatedDiscovery([row],[],new Set(),channelShopeeConfig({},'natal'),[],'natal').length,0);
});

test('Shopee responses distinguish valid empty from malformed HTTP 200 and reject unconverted links',async()=>{
 const wrap=(nodes:unknown[])=>({data:{productOfferV2:{nodes}}});assert.deepEqual(parseShopeeOffers(wrap([])),[]);
 assert.throws(()=>parseShopeeOffers(wrap([{invalid:true}]),new Date(),true),/incompatível/);
 assert.throws(()=>parseShopeeOffers(wrap([node(offer(undefined,{offerLink:'https://shopee.com.br/product/123/456'}))]),new Date(),true),/incompatível/);
 assert.equal(parseShopeeOffers(wrap([node(),node()])).length,1);
 const states:string[]=[];await assert.rejects(requestShopee({limit:1}, {appId:'fixture',secret:'fixture',approved:true},async()=>'id',async(_,state)=>{states.push(state);},async()=>Response.json({errors:[{message:'Signature invalid fixture-private',extensions:{code:10020}}]})),/autenticação/);assert.deepEqual(states,['auth']);
 assert.equal(validShopeeAffiliateLink('https://shopee.com.br/product/123/456'),false);assert.equal(validShopeeAffiliateLink('https://s.shopee.com.br.attacker.invalid/link'),false);
 assert.throws(()=>shopeeProduct(offer(undefined,{offerLink:'https://shopee.com.br/product/123/456'}),crypto.randomUUID(),'beleza'),/Link de afiliado/);
});

test('central product lookup uses server credentials and returns the exact administrator API link',async()=>{
 const events:any[]=[];const db={rpc:async(name:string,args:any)=>{events.push({name,args});return {data:name==='dropou_shopee_reserve_v2'?{id:'reservation'}:true};}} as unknown as SupabaseClient;
 const result=await requestProductOffers(db,'owner','beleza',[{shopId:'123',itemId:'456'}],'fixture-request',env,async(url,init)=>{assert.equal(url,'https://open-api.affiliate.shopee.com.br/graphql');assert.match(String((init?.headers as any).Authorization),/Credential=fixture-admin/);return Response.json({data:{p0:{nodes:[node()]}}});});
 assert.equal(result[0]?.offerLink,offer().offerLink);assert.equal(events[0].args.p_owner,'owner');assert.equal(events[0].args.p_brand,'beleza');assert.equal(events.length,2);
});

test('short links resolve through bounded official redirects and reject other marketplaces',async()=>{
 const resolved=await resolveShopeeProductLink('https://br.shp.ee/fixture',async(_url,init)=>{assert.equal(init?.method,'HEAD');assert.equal(init?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://shopee.com.br/product/123/456'}});});assert.equal(resolved.itemId,'456');
 await assert.rejects(resolveShopeeProductLink('https://s.shopee.com.br/fixture',async()=>new Response(null,{status:302,headers:{location:'https://attacker.invalid/secret'}})),/oficiais/);
 await assert.rejects(resolveShopeeProductLink('https://mercadolivre.com.br/product/123/456'),/oficiais/);
 assert.equal(shopeeProductLink('https://shopee.com.br/opaanlp/123/456?affiliate_id=another').canonical,'https://shopee.com.br/product/123/456');
 assert.equal(shopeeProductLink('https://s.shopee.com.br/an_redir?origin_link='+encodeURIComponent('https://shopee.com.br/product/123/456')+'&affiliate_id=999').canonical,'https://shopee.com.br/product/123/456');
 assert.throws(()=>shopeeProductLink('https://s.shopee.com.br/an_redir?origin_link=https://attacker.invalid/product/123/456'),/Destino/);
 assert.equal(validShopeeAffiliateLink('https://s.shopee.com.br/an_redir'),false);
});

test('failed authentication preserves the saved original and never prepares or substitutes it as affiliate',async()=>{
 const original='https://shopee.com.br/product/123/456?original=fixture';const row={id:'saved',input_url:original,lease_token:'lease'},events:any[]=[];let calls=0;
 const db={rpc:async(name:string,args:any)=>{events.push({name,args});if(name==='dropou_shopee_saved_claim_channel')return {data:[row]};if(name==='dropou_shopee_reserve_v2')return {data:{id:'request'}};if(name==='dropou_shopee_saved_finish_channel')return {data:'saved'};return {data:true};},from(){const q:any={insert(){return q;},select(){return q;},eq(){return q;},maybeSingle:async()=>({data:null}),then(resolve:Function){return Promise.resolve({data:true}).then(resolve as any);}};return q;}} as unknown as SupabaseClient;
 const result=await resolveSavedShopeeProducts(db,'owner',['saved'],false,env,async()=>{calls++;return new Response(null,{status:401});},'beleza');
 assert.equal(result.errorCode,'auth');assert.equal(result.stopped,true);assert.equal(calls,1);assert.equal(row.input_url,original);
 const finish=events.find(e=>e.name==='dropou_shopee_saved_finish_channel');assert.equal(finish.args.p_data,null);assert.match(finish.args.p_error,/autenticação/);assert.ok(!events.some(e=>e.name.includes('prepare')));assert.doesNotMatch(JSON.stringify(result),/fixture-server-only/);
});

test('member access permits shared Shopee but keeps credentials, bots, sends and settings restricted',()=>{
 for(const brand of ['beleza','casa','natal']){
  for(const path of ['/api/shopee/saved-products','/api/shopee/automation','/api/products/lookup','/api/products/resolve'])assert.equal(operationIntegrationUnavailable(brand,path,'POST'),false);
  for(const path of ['/api/integrations/shopee','/api/shopee/test-telegram','/api/telegram/connections','/api/offers/00000000-0000-4000-8000-000000000001/telegram','/api/publication-config'])assert.equal(operationIntegrationUnavailable(brand,path,'POST'),true);
 }
 assert.equal(workspaceAdminRequired('/api/shopee/automation','PATCH'),true);
});

test('member search consumes at most three calls, scopes cache and returns an honest empty state',async()=>{
 for(const brand of ['beleza','casa','natal'] as const){let cached=false,calls=0;const events:any[]=[];
  const db={rpc:async(name:string,args:any)=>{events.push({name,args});if(name==='dropou_shopee_search_claim')return {data:'lease'};if(name==='dropou_member_search_window')return {data:{cached,cursor:0}};if(name==='dropou_shopee_reserve_v2')return {data:{id:'request-'+calls}};if(name==='dropou_member_search_complete')cached=true;return {data:true};},from(){const q:any={select(){return q;},eq(){return q;},single:async()=>({data:{shopee_config:{},radar:{}}}),update(){return q;},then(resolve:Function){return Promise.resolve({data:true}).then(resolve as any);}};return q;}} as unknown as SupabaseClient;
  const http:typeof fetch=async(_url,init)=>{calls++;const query=JSON.parse(String(init?.body)).query;assert.doesNotMatch(query,/gamer/);return Response.json({data:{productOfferV2:{nodes:[]}}});};
  const result=await searchChannel(db,'owner',brand,env,http);assert.equal(result.status,'complete');assert.equal(result.received,0);assert.equal(result.found,0);assert.equal(calls,3);
  const second=await searchChannel(db,'owner',brand,env,http);assert.equal(second.cached,true);assert.equal(calls,3);
  assert.ok(events.filter(e=>e.name==='dropou_shopee_cache_channel').every(e=>e.args.p_brand===brand));
 }
});

test('incremental member Shopee integration preserves RLS, central ownership and paused publication',async t=>{
 const db=new PGlite(),owner='30000000-0000-4000-8000-000000000001',karen='30000000-0000-4000-8000-000000000002',stranger='30000000-0000-4000-8000-000000000003';
 const one=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(uid=owner,brand='all',name='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${karen}'),('${stranger}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await role(owner,'all','service_role');await db.query("select dropou_assign_member($1,$1,$2,'operator',array['beleza','casa','natal'],'Karen')",[owner,karen]);
  const prepared:any[]=[];
  await t.test('shared import claim, official finish and preparation work independently in three brands',async()=>{
   for(const brand of ['beleza','casa','natal'] as const){await role(owner,'all','service_role');const o=offer(brand==='beleza'?'Batom feminino':brand==='casa'?'Vaso decorativo':'Árvore de Natal');const saved=await one('insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url) values($1,$2,$3,$3) returning id',[owner,brand,o.productLink]);
    const claimed=await one('select * from dropou_shopee_saved_claim_channel($1,$2,$3,false)',[brand,owner,[saved.id]]);await one('select dropou_shopee_saved_finish_channel($1,$2,$3,$4,$5,null)',[brand,owner,saved.id,claimed.lease_token,JSON.stringify(o)]);
    const p=shopeeProduct(o,crypto.randomUUID(),brand);const result=(await one('select dropou_shopee_saved_prepare_channel($1,$2,$3,$4,$5) r',[brand,owner,saved.id,JSON.stringify(p),formatCaption(p,brand)])).r;prepared.push({brand,id:result.productId});
   }
   assert.equal(new Set(prepared.map(p=>p.id)).size,3);assert.equal((await one('select count(*) n from telegram_jobs')).n,0);
  });
  await t.test('Karen sees only the active brand and cannot write cache or invoke server-only imports',async()=>{
   await role(karen,'beleza');assert.equal((await db.query('select * from products')).rows.length,1);assert.equal((await db.query('select * from shopee_saved_products')).rows.length,1);
   await assert.rejects(db.query("select dropou_shopee_saved_claim_channel('beleza',$1,$2,false)",[owner,[]]));await assert.rejects(db.exec("update shopee_saved_products set data='{}'"));
   await role(karen,'dropou');assert.equal((await db.query('select * from products')).rows.length,0);await role(stranger,'all');assert.equal((await db.query('select * from products')).rows.length,0);
  });
  await t.test('curation prepares an official product once, with no queue or cross-brand decision changes',async()=>{
   await role(owner,'all','service_role');const o=offer('Kit bolas natalinas',{itemId:'999',productLink:'https://shopee.com.br/product/123/999'}),assessment=assessShopeeOffer(o,channelShopeeConfig({},'natal'),[],'natal');
   const rows=[{shop_id:o.shopId,item_id:o.itemId,data:o,score:assessment.score,eligible:assessment.eligible,reasons:assessment.reasons,assessment,checked_at:o.checkedAt}];
   await one("select dropou_shopee_cache_channel('natal',$1,$2)",[owner,JSON.stringify(rows)]);const cache=await one("select id from shopee_offers where brand_id='natal' and item_id='999'");
   const p=shopeeProduct(o,crypto.randomUUID(),'natal');const first=(await one("select dropou_curate_channel('natal',$1,'cache',$2,'approved',$3,$4) r",[owner,cache.id,JSON.stringify(p),formatCaption(p,'natal')])).r;
   await assert.rejects(db.query("select dropou_curate_channel('natal',$1,'cache',$2,'approved',$3,$4) r",[owner,cache.id,JSON.stringify(p),formatCaption(p,'natal')]),/já foi decidida/);
   assert.ok(first.productId);assert.equal((await one("select count(*) n from products where brand_id='natal' and canonical_url='shopee.com.br/product/123/999'")).n,1);assert.equal((await one('select count(*) n from telegram_jobs')).n,0);
   await role(karen,'beleza');assert.equal((await db.query('select * from shopee_offers')).rows.length,0);
  });
  await t.test('invalid recent ready cache can be reclaimed without losing the input link',async()=>{
   await role(owner,'all','service_role');const link='https://shopee.com.br/product/123/888',bad=offer(undefined,{itemId:'888',productLink:link,offerLink:link});
   const saved=await one("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,shop_id,item_id,state,data) values($1,'casa',$2,$2,'123','888','ready',$3) returning id",[owner,link,JSON.stringify(bad)]);
   const claimed=await one("select * from dropou_shopee_saved_claim_channel('casa',$1,$2,false)",[owner,[saved.id]]);assert.equal(claimed.id,saved.id);assert.equal(claimed.input_url,link);
  });
  await t.test('original or forged affiliate link cannot produce a ready product or offer through direct RPC',async()=>{
   await role(karen,'beleza');const row=await one('select data from products');const forged={...row.data,affiliateUrl:'https://s.shopee.com.br/other-account',status:'pronto'};
   const draft=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(forged),productKey(forged)])).p;assert.notEqual(draft.status,'pronto');
   await assert.rejects(db.query('select dropou_save_offer_version($1,$2,$3,$3,false)',[draft.id,JSON.stringify(draft),formatCaption(draft,'beleza')]),/afiliado/);
   await assert.rejects(db.query("update offers set snapshot=jsonb_set(snapshot,'{affiliateUrl}','\"https://shopee.com.br/product/123/456\"')"),/afiliado/);
  });
  await t.test('valid review saves an offer as ready and preserves its affiliate binding after saved-link retention',async()=>{
   // Restore the official link after the preceding adversarial draft edit.
   await role(owner,'all','service_role');const o=offer('Batom feminino'),p=(await one("select data from products where brand_id='beleza'")).data;
   const restored={...p,affiliateUrl:o.offerLink};await db.query('update products set data=$1 where id=$2',[JSON.stringify(restored),p.id]);
   await role(karen,'beleza');const text=formatCaption(restored,'beleza');const saved=(await one('select dropou_save_offer_version($1,$2,$3,$3,true) r',[p.id,JSON.stringify(restored),text])).r;
   await role(owner,'all','service_role');const reviewed=(await one('select dropou_publication_reconfirm($1,$2,$3) r',[owner,saved.id,JSON.stringify(saved.snapshot)])).r;
   assert.equal(reviewed.status,'pronto');assert.equal(reviewed.snapshot.affiliateUrl,o.offerLink);assert.equal(reviewed.snapshot.inStock,true);
   await db.query("delete from shopee_saved_products where owner_id=$1 and brand_id='beleza'",[owner]);
   await role(karen,'beleza');assert.equal((await one("select private.dropou_member_affiliate_allowed($1,'beleza',$2) ok",[owner,JSON.stringify(reviewed.snapshot)])).ok,true);
   assert.equal((await one('select count(*) n from telegram_jobs')).n,0);
  });
  await t.test('policy cache is per brand/token and excludes failures; all publication flags remain off',async()=>{
   await role(owner,'all','service_role');const token=(await one("select dropou_shopee_search_claim($1,'beleza') token",[owner])).token;
   assert.equal((await one("select dropou_member_search_window($1,'beleza',$2,$3,3) r",[owner,token,'a'.repeat(64)])).r.cached,false);
   await one("select dropou_member_search_complete($1,'beleza',$2,$3)",[owner,token,'a'.repeat(64)]);
   assert.equal((await one("select dropou_member_search_window($1,'beleza',$2,$3,3) r",[owner,token,'a'.repeat(64)])).r.cached,true);
   await assert.rejects(db.query("select dropou_member_search_window($1,'casa',$2,$3,3)",[owner,token,'a'.repeat(64)]),/Reserva/);
   await assert.rejects(db.exec("update operation_settings set automation_enabled=true where brand_id='beleza'"));await assert.rejects(db.exec("update operation_settings set telegram_chat_id='-100123456' where brand_id='casa'"));
   assert.equal((await one("select count(*) n from operation_settings where brand_id in ('beleza','casa','natal') and automation_enabled")).n,0);
  });
 }finally{await db.close();}
});
