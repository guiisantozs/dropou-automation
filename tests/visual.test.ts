import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {modelConfig} from '../src/server/ai/core';
import {analyzeVisual,limitedJson,validateImages,visualBody,visualEstimate,VisualStore} from '../src/server/ai/visual-core';
import {monetaryValue,priceMath,validateVisual,VisualExtraction,visualDraft,visualPreview} from '../src/lib/visual';
import {emptyProduct} from '../src/lib/product-draft';
import {generate} from '../src/server/ai/core';
import {parseScreenshot} from '../src/lib/ocr';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const config={...modelConfig({}),enabled:true,key:'mock-no-credits'};
export const extraction:VisualExtraction={productName:'Controle GameSir T4 Nova Lite',brand:'GameSir',model:'T4 Nova Lite',selectedVariant:'Branco',currentPrice:160.34,previousPrice:299,displayedDiscount:46,paymentCondition:'pix',installments:'3x de R$ 56,00',rating:4.9,salesCount:'+10 mil vendidos',features:['Hall Effect','PC, Switch e Mobile'],sellerName:'GameSir Oficial',creativeHeadline:'🎮🔥 MAIS CONTROLE PARA SUAS PARTIDAS!',uncertainFields:[],priceContext:'selected_product',discountContext:'consumer'};
export function jpeg(width=800,height=1200){const bytes=Buffer.from([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);return {dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),width,height};}
function provider(counter:{calls:number},data:unknown=extraction):typeof fetch{return async(url,init)=>{
 counter.calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(init?.body));assert.equal(body.input[0].content[1].type,'input_image');assert.equal(body.store,false);assert.equal(body.tools,undefined);
 return Response.json({status:'completed',usage:{input_tokens:2400,output_tokens:350,input_tokens_details:{cached_tokens:0}},output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]});
};}

test('visual monetary normalization and deterministic discounts do not copy affiliate commission',()=>{
 assert.equal(monetaryValue('R$ 1.234,56'),1234.56);assert.equal(monetaryValue('160,34'),160.34);assert.equal(monetaryValue('160.34'),160.34);assert.equal(monetaryValue('1.234'),null);assert.equal(monetaryValue(-1),null);
 const data=validateVisual({...extraction,currentPrice:'R$ 160,34',previousPrice:'299,00',rating:'4,9'});assert.equal(data.currentPrice,160.34);assert.equal(data.rating,4.9);
 assert.deepEqual(priceMath(160.34,299),{savings:138.66,discount:46});assert.equal(priceMath(299,160.34),null);
 assert.equal(validateVisual({...extraction,displayedDiscount:12,discountContext:'affiliate_commission'}).displayedDiscount,null);
 assert.equal(validateVisual({...extraction,displayedDiscount:12}).displayedDiscount,null);
});
test('related products, coupons, affiliate payouts and ambiguous selected variants never become a current price',()=>{
 for(const priceContext of ['related_product','coupon','affiliate_commission','ambiguous','not_visible']){const data=validateVisual({...extraction,priceContext});assert.equal(data.currentPrice,null);assert.ok(data.uncertainFields.includes('currentPrice'));}
 const variant=validateVisual({...extraction,uncertainFields:['selectedVariant']});assert.equal(variant.currentPrice,null);assert.ok(variant.uncertainFields.includes('currentPrice'));
 const invalid=validateVisual({...extraction,currentPrice:'invalid'});assert.equal(invalid.currentPrice,null);
 assert.throws(()=>validateVisual({...extraction,features:[...Array(7)].map(()=> 'inventado')}));
});
test('visual draft keeps brand/model/selected variant and original link without marking screenshot as live verification',()=>{
 const link='https://meli.la/oferta?tracking=a%2Fb&x=1';
 const p=visualDraft({...emptyProduct(),affiliateUrl:link},validateVisual(extraction),'dropou');
 assert.equal(p.affiliateUrl,link);assert.equal(p.name,'Controle GameSir T4 Nova Lite — Branco');assert.equal(p.visualDetails?.model,'T4 Nova Lite');assert.equal(p.checkedAt,null);assert.equal(p.inStock,null);assert.equal(p.screenshotConfirmed,false);assert.equal(p.previousVerified,false);assert.equal(p.pixVerified,false);
 const preview=visualPreview(p,'dropou');assert.match(preview,/138,66/);assert.match(preview,/160,34/);assert.ok(preview.includes(link));assert.match(preview,/Nota 4,9/);
 const missing=visualDraft({...emptyProduct(),affiliateUrl:link},{...extraction,currentPrice:null},'dropou');assert.match(visualPreview(missing,'dropou'),/Confirme/);
});
test('visual request uses optimized images, no tools/history/links and a bounded structured response',()=>{
 const image=jpeg(),validated=validateImages([image]);assert.equal(validated[0].hash.length,64);
 assert.throws(()=>validateImages([{...image,width:2000}]),/Dimensões/);assert.throws(()=>validateImages([{...image,dataUrl:'https://arbitrary.example/image.jpg'}]));
 const body=visualBody([image,image],'dropou',config.model);assert.equal(body.input[0].content.length,3);assert.equal(body.max_output_tokens,900);assert.equal(body.reasoning?.effort,'none');
 const withoutImages={...body,input:body.input.map(item=>({...item,content:item.content.filter(c=>c.type!=='input_image')}))};assert.ok(Buffer.byteLength(JSON.stringify(withoutImages))+2048<8192);
 assert.equal(visualEstimate(1,config.rates),0.00557);assert.equal(visualEstimate(3,config.rates),0.013762);
});
test('request body is limited even with no Content-Length, before JSON decode',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(200)));controller.close();}});
 const request=new Request('https://dropou.test/api',{method:'POST',body:stream,duplex:'half'} as RequestInit);
 await assert.rejects(limitedJson(request,100),/tamanho permitido/);
});
test('OCR fallback ignores recommendation panels and affiliate earnings, and rejects multiple highlighted prices',()=>{
 const result=parseScreenshot('Controle GameSir T4 Nova Lite\nGANHOS 12% R$ 19,24\nDe: R$ 299,00\nPor R$ 160,34 no Pix\nProdutos relacionados\nPor R$ 29,90',94);
 assert.equal(result.name,'Controle GameSir T4 Nova Lite');assert.equal(result.price,160.34);assert.equal(result.previousPrice,299);assert.equal(result.paymentCondition,'pix');
 assert.equal(parseScreenshot('Controle\nPor R$ 160,34\nPor R$ 200,00',92).price,null);
});
test('saved creative headline is reused without a second paid formatting call',async()=>{
 const p={...visualDraft({...emptyProduct(),affiliateUrl:'https://meli.la/test'},extraction,'dropou'),checkedAt:new Date().toISOString(),inStock:true,screenshotConfirmed:true,pixVerified:true};
 const result=await generate([p],'dropou',1,{reserve:async()=>{throw new Error('must not reserve');},finish:async()=>{throw new Error('must not finish');}},config,async()=>{throw new Error('must not call');});
 assert.equal(result[0].source,'local');assert.match(result[0].captions[0],/MAIS CONTROLE/);
});

test('visual cache and caption calls share the atomic budget; no image content is persisted',async(t)=>{
 const db=new PGlite();let counter={calls:0};
 try{
  await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for(const path of ['supabase/schema.sql','supabase/whatsapp-flow.sql','supabase/ai-economy.sql','supabase/ai-visual.sql'])await db.exec(readFileSync(path,'utf8'));
  await db.exec(readFileSync('supabase/ai-visual.sql','utf8'));await db.exec('set role service_role');
  function store(user=owner):VisualStore{return {async reserve(key,hashes,model,brand,maxCost,rates){const r=await db.query<{r:Awaited<ReturnType<VisualStore['reserve']>>}>('select dropou_economy_visual_reserve($1,$2,$3,$4,$5,$6,$7,$8) r',[user,key,JSON.stringify(hashes),model,brand,'dropou-visual-1',maxCost,JSON.stringify(rates)]);return r.rows[0].r;},async finish(id,result,payload){await db.query('select dropou_economy_visual_finish($1,$2,$3)',[id,JSON.stringify(result),payload?JSON.stringify(payload):null]);}};}
  await t.test('default off and missing API key use free fallback without touching provider',async()=>{
   assert.equal((await analyzeVisual([jpeg()],'dropou',store(),config,provider(counter))).source,'local');assert.equal(counter.calls,0);
   await db.exec('update ai_budget set enabled=true');assert.equal((await analyzeVisual([jpeg()],'dropou',store(),{...config,key:undefined},provider(counter))).source,'local');assert.equal(counter.calls,0);
  });
  await t.test('multiple images plus creative headline use one paid request; repeated analysis is cached',async()=>{
   const first=await analyzeVisual([jpeg(),jpeg(900,1200)],'dropou',store(),config,provider(counter));assert.equal(first.source,'openai');assert.equal(counter.calls,1);assert.equal(first.extraction?.model,'T4 Nova Lite');assert.equal(first.usage?.cost,0.000415);
   const cached=await analyzeVisual([jpeg(),jpeg(900,1200)],'dropou',store(),{...config,enabled:false},provider(counter));assert.equal(cached.source,'cache');assert.equal(counter.calls,1);
   const rows=await db.query('select * from ai_visual_cache');assert.ok(!JSON.stringify(rows.rows).includes('base64'));assert.ok(!JSON.stringify(rows.rows).includes('data:image'));assert.ok(!JSON.stringify(rows.rows).includes('affiliateUrl'));
  });
  await t.test('pending duplicate and global budget cap block a concurrent second provider request',async()=>{
   let start!:()=>void,finish!:()=>void;const started=new Promise<void>(r=>{start=r;}),gate=new Promise<void>(r=>{finish=r;});
   const slow:typeof fetch=async(...args)=>{start();await gate;return provider(counter)(...args);};
   await db.exec('update ai_budget set total_limit=0.01');const before=counter.calls;
   const first=analyzeVisual([jpeg(800,1100)],'dropou',store(),config,slow);await started;
   const duplicate=await analyzeVisual([jpeg(800,1100)],'dropou',store(),config,provider(counter));assert.equal(duplicate.source,'local');
   const otherImage=await analyzeVisual([jpeg(700,1100)],'dropou',store(other),config,provider(counter));assert.equal(otherImage.source,'local');assert.match(otherImage.message!,/Orçamento/);
   finish();await first;assert.equal(counter.calls-before,1);await db.exec('update ai_budget set total_limit=4.5');
  });
  await t.test('cache is owner-specific and respects brand/prompt/model inputs',async()=>{
   const before=counter.calls;await analyzeVisual([jpeg(),jpeg(900,1200)],'dropou',store(other),config,provider(counter));assert.equal(counter.calls-before,1);
   await analyzeVisual([jpeg(),jpeg(900,1200)],'linda',store(),config,provider(counter));assert.equal(counter.calls-before,2);
  });
  await t.test('rate limits, quota and uncertain timeouts do not trigger automatic retries',async()=>{
   let calls=0;const quota:typeof fetch=async()=>{calls++;return Response.json({error:{code:'insufficient_quota'}},{status:429});};
   const image=jpeg(600,1100);const r=await analyzeVisual([image],'dropou',store(),config,quota);assert.equal(r.source,'local');await analyzeVisual([image],'dropou',store(),config,quota);assert.equal(calls,1);
   await db.exec('update ai_budget set enabled=true');const limited:typeof fetch=async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'120'}});};
   await analyzeVisual([jpeg(610,1100)],'dropou',store(),config,limited);await analyzeVisual([jpeg(610,1100)],'dropou',store(),config,limited);assert.equal(calls,2);
   await db.exec('update ai_budget set not_before=null');const timeout:typeof fetch=async()=>{calls++;throw new Error('timeout');};
   await analyzeVisual([image],'dropou',store(),config,timeout);await analyzeVisual([image],'dropou',store(),config,timeout);assert.equal(calls,3);
   const uncertain=await db.query<{state:string;cost:string}>('select state,cost_usd::text cost from ai_requests order by created_at desc limit 1');assert.equal(uncertain.rows[0].state,'uncertain');assert.equal(Number(uncertain.rows[0].cost),visualEstimate(1,config.rates));
  });
  await t.test('visual consumption is visible within the same ledger; direct access is denied to clients',async()=>{
   const result=await db.query<{u:{calls:number;cost:number;cache:number}}>('select dropou_economy_visual_usage() u');assert.ok(Number(result.rows[0].u.calls)>0);assert.ok(Number(result.rows[0].u.cost)>0);assert.equal(Number(result.rows[0].u.cache),1);
   for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from ai_visual_cache'),/permission denied/);await assert.rejects(db.query('select dropou_economy_visual_reserve($1,$2,$3,$4,$5,$6,$7,$8)',[owner,'a'.repeat(64),'[]','gpt-6-luna','dropou','1',1,'{}']),/permission denied/);}
  });
 }finally{await db.close();}
});
