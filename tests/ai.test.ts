import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {AIStore,cacheKey,cost,generate,modelConfig,responseBody} from '../src/server/ai/core';
import {generationError,renderCaption,verifiedFacts} from '../src/lib/ai';
import {assertAIAdmin} from '../src/lib/ai-admin';
import {affiliateStore} from '../src/lib/affiliate';
import {parseScreenshot} from '../src/lib/ocr';
import {emptyProduct} from '../src/lib/product-draft';
import type {Product} from '../src/lib/domain';
import {telegramText} from '../src/lib/telegram-text';
const owner='10000000-0000-4000-8000-000000000001';
const config={...modelConfig({}),key:'test-only-never-sent',enabled:true};
const product=(overrides:Partial<Product>={}):Product=>({...emptyProduct(),name:'Monitor Gamer AOC',price:599,previousPrice:749,previousVerified:true,affiliateUrl:'https://meli.la/test?tracking=original%2Fab',checkedAt:new Date().toISOString(),inStock:true,...overrides});
const usage={input_tokens:200,output_tokens:40,input_tokens_details:{cached_tokens:50}};
function provider(counter:{calls:number},headlines=['🖥️ SEU SETUP MERECE UM NOVO OLHAR!']):typeof fetch{return async(_url,init)=>{counter.calls++;const body=JSON.parse(String(init?.body));const input=JSON.parse(body.input);return Response.json({status:'completed',usage,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({offers:input.produtos.map(()=>({headlines}))})}]}]});};}
async function database(){
 const db=new PGlite();
 await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role bypassrls;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const path of ['supabase/schema.sql','supabase/whatsapp-flow.sql','supabase/ai-economy.sql'])await db.exec(readFileSync(path,'utf8'));
 await db.exec('create table public.telegram_jobs(product_id uuid,state text);grant all on public.telegram_jobs to service_role;');
 await db.exec(readFileSync('supabase/telegram-offers.sql','utf8'));
 await db.exec(readFileSync('supabase/ai-economy.sql','utf8'));
 await db.exec('create schema storage;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);');
 await db.exec(readFileSync('supabase/migrations/20261106132921_offer_editor_and_thumbnails.sql','utf8'));
 const store:AIStore={async reserve(entries,model,maxCost){const result=await db.query<{r:Awaited<ReturnType<AIStore['reserve']>>}>('select public.dropou_economy_ai_reserve($1,$2::jsonb,$3,$4) r',[owner,JSON.stringify(entries),model,maxCost]);return result.rows[0].r;},async finish(id,result){await db.query('select public.dropou_economy_ai_finish($1,$2::jsonb)',[id,JSON.stringify(result)]);}};
 async function insert(p:Product){await db.query('insert into products(id,owner_id,canonical_url,data) values($1,$2,$3,$4::jsonb)',[p.id,owner,p.affiliateUrl+'/'+p.id,JSON.stringify(p)]);}
 return {db,store,insert};
}

test('cache keys change with verified data, brand, prompt/model/variants, never timestamps',()=>{
 const p=product();const key=cacheKey(p,'dropou',1,config.model);
 assert.equal(key,cacheKey({...p,checkedAt:new Date(Date.now()+100).toISOString(),status:'pronto'},'dropou',1,config.model));
 for(const changed of [{price:600},{previousVerified:false},{affiliateUrl:p.affiliateUrl+'&x=2'},{installments:'3x de R$ 200',installmentsVerified:true},{features:['IPS'],featuresVerified:true}])assert.notEqual(key,cacheKey({...p,...changed},'dropou',1,config.model));
 assert.notEqual(key,cacheKey(p,'linda',1,config.model));assert.notEqual(key,cacheKey(p,'dropou',3,config.model));assert.notEqual(key,cacheKey(p,'dropou',1,'other'));
});
test('integer cents, verified conditions, exact affiliate link and brand are formatted locally',()=>{
 const p=product({price:418.41,previousPrice:449.90});
 const text=renderCaption(p);assert.match(text,/31,49/);assert.match(text,/~R\$\s449,90~/);assert.ok(text.includes(p.affiliateUrl));assert.match(text,/#publi/);
 assert.ok(!renderCaption({...p,previousVerified:false}).includes('ECONOMIZE'));
 assert.ok(!renderCaption({...p,installments:'SEM JUROS',installmentsVerified:false}).includes('SEM JUROS'));
 assert.match(renderCaption(p,'linda'),/Amiga, tá linda/);
 assert.ok(generationError({...p,dataOrigin:'screenshot',screenshotConfirmed:false}));
 assert.match(renderCaption({...p,checkedAt:new Date(Date.now()-16*60000).toISOString()}),/RASCUNHO/);
});
test('Responses request is text only, compact, structured, no tools, no history, no reasoning',()=>{
 const body=responseBody([product()],'dropou',1,config.model);
 assert.equal(body.reasoning?.effort,'none');assert.equal(body.store,false);assert.equal(body.max_output_tokens,180);assert.equal(body.text.format.type,'json_schema');
 assert.equal('tools' in body,false);assert.equal('previous_response_id' in body,false);assert.ok(!body.input.includes('http'));
 assert.equal(cost(config.rates,200,40,50),0.0000355);
 assert.equal(cost(config.rates,200,40,50,100),0.000038);
 assert.throws(()=>modelConfig({OPENAI_MODEL:'unpriced'}),/preços/);
});
test('Telegram renders emphasis with UTF-16 offsets and preserves affiliate URLs verbatim',()=>{
 const result=telegramText('💙 *Monitor*\n~R$ 749,00~\nhttps://meli.la/x?a=~x~&b=*y*');
 assert.equal(result.text,'💙 Monitor\nR$ 749,00\nhttps://meli.la/x?a=~x~&b=*y*');
 assert.equal(result.entities.length,2);assert.equal(result.entities[0].offset,3);assert.equal(result.entities[0].length,7);
});
test('affiliate identification and OCR keep installment amounts out of product price',()=>{
 assert.equal(affiliateStore('https://meli.la/exemplo?a=1'),'Mercado Livre');assert.equal(affiliateStore('https://s.shopee.com.br/id'),'Shopee');
 assert.throws(()=>affiliateStore('https://shopee.com.br.fake.com/x'));
 const result=parseScreenshot('Monitor Gamer AOC\nDe: R$ 749,00\nPor R$ 599,00\n10x de R$ 59,90 sem juros\n144 Hz IPS',94);
 assert.equal(result.name,'Monitor Gamer AOC');assert.equal(result.price,599);assert.equal(result.previousPrice,749);assert.match(result.installments,/10x/);
 assert.equal(parseScreenshot('Produto\nR$ 100,00\nR$ 200,00',65).price,null);
});
test('AI administrator allowlist rejects missing, partial and unlisted identities',()=>{
 assert.doesNotThrow(()=>assertAIAdmin(owner,owner));assert.throws(()=>assertAIAdmin(owner,''),/FORBIDDEN/);
 assert.throws(()=>assertAIAdmin('100',owner),/FORBIDDEN/);assert.throws(()=>assertAIAdmin(owner,'other'),/FORBIDDEN/);
});

test('Postgres ledger: cache, duplicates, budgets, retries, roles and Telegram',async(t)=>{
 const {db,store,insert}=await database();const counter={calls:0};const p=product();
 try{
  await insert(p);await db.exec('set role service_role');
  await t.test('paid generation disabled by default: zero provider calls',async()=>{const r=await generate([p],'dropou',1,store,config,provider(counter));assert.equal(r[0].source,'local');assert.equal(counter.calls,0);});
  await db.exec('update ai_budget set enabled=true');
  await t.test('one new caption; repeated requests avoid two provider calls through durable cache',async()=>{
   const r=await generate([p],'dropou',1,store,config,provider(counter));assert.equal(r[0].source,'openai');assert.equal(counter.calls,1);assert.match(r[0].captions[0],/150,00/);
   for(let i=0;i<2;i++){const cached=await generate([p],'dropou',1,store,config,provider(counter));assert.equal(cached[0].source,'cache');assert.equal(cached[0].captions[0],r[0].captions[0]);}
   assert.equal(counter.calls,1);const hits=await db.query<{n:number}>('select count(*)::int n from ai_cache_hits');assert.equal(hits.rows[0].n,2);
  });
  await t.test('three variations for two products fit a single request and malformed numeric claims are replaced',async()=>{
   const second=product({name:'Headset Gamer'});await insert(second);
   const before=counter.calls;const r=await generate([p,second],'barato',3,store,config,provider(counter,['🔥 SEU PRÓXIMO ACHADO ESTÁ AQUI!','FRETE GRÁTIS COM 99% OFF','💖 AMIGA, OLHA ESSE ACHADINHO!']));
   assert.equal(counter.calls-before,1);assert.equal(r.length,2);assert.equal(r[0].captions.length,3);assert.ok(!r[0].captions[1].includes('99%'));assert.ok(!r[0].captions[1].includes('FRETE GRÁTIS'));
  });
  await t.test('overlapping generation reserves the product once, even before completion',async()=>{
   const second=product();await insert(second);let start!:()=>void,finish!:()=>void;
   const started=new Promise<void>(r=>{start=r;}),gate=new Promise<void>(r=>{finish=r;});
   const slow:typeof fetch=async(...args)=>{start();await gate;return provider(counter)(...args);};
   const before=counter.calls;const first=generate([second],'dropou',1,store,config,slow);await started;
   const duplicate=await generate([second],'dropou',1,store,config,provider(counter));assert.equal(duplicate[0].source,'local');finish();await first;assert.equal(counter.calls-before,1);
  });
  await t.test('stale and unconfirmed screenshot products incur no paid calls and cannot use a cached price',async()=>{
   const before=counter.calls;const stale={...p,checkedAt:new Date(Date.now()-16*60000).toISOString()};
   const r=await generate([stale,{...p,id:crypto.randomUUID(),dataOrigin:'screenshot',screenshotConfirmed:false}],'dropou',1,store,config,provider(counter));assert.equal(counter.calls,before);assert.ok(r.every(r=>r.source==='local'));
  });
  await t.test('operational and daily limits include in-flight reservations; cache still works at cap',async()=>{
   const second=product();await insert(second);const before=counter.calls;
   await db.exec('update ai_budget set total_limit=0');const r=await generate([p,second],'dropou',1,store,config,provider(counter));assert.equal(r[0].source,'cache');assert.equal(r[1].source,'local');assert.equal(counter.calls,before);
   await db.exec('update ai_budget set total_limit=4.5,daily_requests=0');await generate([second],'dropou',1,store,config,provider(counter));assert.equal(counter.calls,before);
   await db.exec('update ai_budget set daily_requests=100,daily_limit=0');await generate([second],'dropou',1,store,config,provider(counter));assert.equal(counter.calls,before);
   await db.exec('update ai_budget set daily_limit=0.5');
   const key=cacheKey(second,'dropou',1,config.model);const entry={key,productId:second.id,marketplace:second.store,verifiedData:verifiedFacts(second),brand:'dropou' as const,prompt:'dropou-1',variants:1};
   await db.exec('update ai_budget set total_limit=0.01,daily_limit=0.01');const a=await store.reserve([entry],config.model,0.009);assert.ok(a.id);
   const third=product();await insert(third);const b=await store.reserve([{...entry,key:'other-key',productId:third.id}],config.model,0.009);assert.ok(!b.id);
   await store.finish(a.id!,{captions:{},input:0,output:0,cached:0,cost:0,state:'failed',captionCount:0});await db.exec('update ai_budget set total_limit=4.5,daily_limit=0.5');
  });
  await t.test('429 quota disables paid generation, does not retry and falls back without breaking offers',async()=>{
   const second=product();await insert(second);let calls=0;
   const http:typeof fetch=async()=>{calls++;return Response.json({error:{code:'insufficient_quota'}},{status:429});};
   const r=await generate([second],'dropou',1,store,config,http);assert.equal(r[0].source,'local');assert.equal(calls,1);assert.match(r[0].message!,/Crédito/);
   await generate([second],'dropou',1,store,config,http);assert.equal(calls,1);await db.exec('update ai_budget set enabled=true');
  });
  await t.test('429 rate limit respects Retry-After across requests, no retry loop',async()=>{
   const second=product();await insert(second);let calls=0;const http:typeof fetch=async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'120'}});};
   await generate([second],'dropou',1,store,config,http);await generate([second],'dropou',1,store,config,http);assert.equal(calls,1);await db.exec('update ai_budget set not_before=null');
  });
  await t.test('timeout retains financial reserve and product claim, preventing a second paid attempt',async()=>{
   const second=product();await insert(second);let calls=0;const http:typeof fetch=async()=>{calls++;throw new Error('timeout');};
   await generate([second],'dropou',1,store,config,http);await generate([second],'dropou',1,store,config,http);assert.equal(calls,1);
   const r=await db.query<{cost:string;state:string}>('select cost_usd::text cost,state from ai_requests order by created_at desc limit 1');assert.equal(r.rows[0].state,'uncertain');assert.ok(Number(r.rows[0].cost)>0);
  });
  await t.test('usage history reports actual tokens, generated captions and cache hits',async()=>{
   const result=await db.query<{u:{days:{input:number;output:number;captions:number}[];cache:{captions:number}[]}}>('select dropou_economy_ai_usage() u');
   assert.ok(Number(result.rows[0].u.days[0].input)>0);assert.ok(Number(result.rows[0].u.days[0].captions)>=7);assert.ok(Number(result.rows[0].u.cache[0].captions)>=2);
  });
  await t.test('anonymous/authenticated roles cannot mutate budget, cache or invoke paid reservations',async()=>{
   for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from ai_caption_cache'),/permission denied/);await assert.rejects(db.query('update ai_budget set total_limit=100'),/permission denied/);await assert.rejects(db.query("select dropou_economy_ai_reserve($1,'[]','gpt-6-luna',1)",[owner]),/permission denied/);}
   await db.exec('reset role;set role service_role');
  });
  await t.test('Telegram claims are unique, screenshot guard enforced and results persist without any AI',async()=>{
   const second=product({dataOrigin:'screenshot',screenshotConfirmed:false});await insert(second);
   await db.query("insert into offers(owner_id,product_id,caption,snapshot,status) values($1,$2,'Legenda teste',$3,'pronto')",[owner,second.id,JSON.stringify(second)]);
   let o=await db.query<{id:string}>('select id from offers where product_id=$1',[second.id]);
   await assert.rejects(db.query('select dropou_economy_claim_telegram($1,$2)',[owner,o.rows[0].id]),/bloqueada/);
   const confirmed={...second,screenshotConfirmed:true,status:'pronto'};await db.query('update products set data=$1 where id=$2',[JSON.stringify(confirmed),second.id]);await db.query('update offers set snapshot=$1 where id=$2',[JSON.stringify(confirmed),o.rows[0].id]);
   await db.query('select dropou_economy_claim_telegram($1,$2)',[owner,o.rows[0].id]);await assert.rejects(db.query('select dropou_economy_claim_telegram($1,$2)',[owner,o.rows[0].id]),/duplicate key/);
   await db.query('select dropou_economy_finish_telegram($1,$2,$3)',[owner,o.rows[0].id,'123']);await db.query('select dropou_economy_finish_telegram($1,$2,$3)',[owner,o.rows[0].id,'123']);
   const sent=await db.query<{state:string;caption:string}>('select state,caption from deliveries where product_id=$1',[second.id]);assert.equal(sent.rows[0].state,'sent');assert.equal(sent.rows[0].caption,'Legenda teste');
  });
  await t.test('legacy Telegram queue, new delivery queue, product edits and manual publication share duplicate guards',async()=>{
   const second=product({status:'pronto'});await insert(second);
   const inserted=await db.query<{id:string}>("insert into offers(owner_id,product_id,caption,snapshot,status) values($1,$2,'Legenda teste',$3,'pronto') returning id",[owner,second.id,JSON.stringify(second)]);const id=inserted.rows[0].id;
   await db.query("insert into telegram_jobs values($1,'queued')",[second.id]);
   await assert.rejects(db.query('select dropou_economy_claim_telegram($1,$2)',[owner,id]),/fila existente/);
   await db.query("update telegram_jobs set state='cancelled' where product_id=$1",[second.id]);
   await db.query('select dropou_economy_claim_telegram($1,$2)',[owner,id]);
   await assert.rejects(db.query("insert into telegram_jobs values($1,'queued')",[second.id]),/já registrado/);
   await assert.rejects(db.query("update products set data=data||'{\"price\":1}'::jsonb where id=$1",[second.id]),/andamento/);
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
   await assert.rejects(db.query('select dropou_publish_offer($1)',[id]),/Telegram/);
   await db.exec('reset role;set role service_role');
  });
 }finally{await db.close();}
});
