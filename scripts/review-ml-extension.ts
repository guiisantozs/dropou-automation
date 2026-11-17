// Compiled/dev Next UI with synthetic Auth and APIs. Every remote request is intercepted or blocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import {inboxFixture} from '../tests/fixtures/ml-extension';
import {reviewedExtensionProduct} from '../src/lib/mercado-livre-extension';
import {operationSchema} from '../src/lib/workspace-brands';
nextEnv.loadEnvConfig(process.cwd());
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(process.env.LOCALAPPDATA||'','npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright'));
const origin='https://dropou-automation.vercel.app',base=process.env.ML_EXTENSION_REVIEW_BASE||'http://127.0.0.1:4198',owner='90000000-0000-4000-8000-000000000001',out='outputs/ml-extension-review';mkdirSync(out,{recursive:true});
const brands=operationSchema.options.filter(b=>!['beleza','casa','natal'].includes(b)),errors:string[]=[],writes:string[]=[],blocked:string[]=[],captureErrors:string[]=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu','--disable-renderer-backgrounding','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']}),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
let row=inboxFixture(),product=reviewedExtensionProduct(row,{id:row.id,confirmed:true,inStock:true});
try{
 await context.addInitScript(({owner,key}:{owner:string;key:string})=>{
  const exp=Math.floor(Date.now()/1000)+7200,token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replaceAll('=','')+'.'+btoa(JSON.stringify({sub:owner,exp,aud:'authenticated',role:'authenticated'})).replaceAll('=','')+'.Zml4dHVyZQ';
  localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-17T03:00:00Z'}}));
  (window as any).__fixtureStorage=[];const read=Storage.prototype.getItem;Storage.prototype.getItem=function(name:string){if(name.startsWith('sb-'))(window as any).__fixtureStorage.push({sameKey:name===key,hasValue:!!read.call(this,name)});return read.call(this,name);};
 },{owner,key:'sb-'+new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]+'-auth-token'});
 await context.route('**/*',async(route:any)=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='http2.mlstatic.com')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#ddd"/><path d="M40 100v-20a50 50 0 0 1 100 0v20" fill="none" stroke="#222" stroke-width="16"/><rect x="25" y="90" width="30" height="55" rx="12" fill="#333"/><rect x="125" y="90" width="30" height="55" rx="12" fill="#333"/></svg>'});
  if(url.origin!==origin){blocked.push(url.hostname);return route.abort();}
  if(!url.pathname.startsWith('/api/')){if(req.method()!=='GET')return route.abort();return route.fulfill({response:await route.fetch({url:base+url.pathname+url.search})});}
  const body=req.postDataJSON(),brand=operationSchema.catch('dropou').parse(req.headers()['x-dropou-brand']);let data:unknown;
  if(req.method()!=='GET')writes.push(url.pathname);
  if(url.pathname==='/api/operations')data={profile:{firstName:'Conta demonstrativa'},access:{admin:true,brands:operationSchema.options},operations:operationSchema.options.map(brand_id=>({brand_id,display_name:brand_id}))};
  else if(url.pathname==='/api/mercado-livre/extension'){
   if(req.method()==='GET')data={rows:[]};else if(body.action==='prepare'){assert.equal(body.review.confirmed,true);product=reviewedExtensionProduct(row,body.review);data={product,existing:false};}else{assert.equal(body.review,'candidate');assert.equal(body.originalUrl,row.original_url);data=row;}
  }else if(url.pathname.endsWith('/offer'))data={product,offer:null,serverNow:new Date().toISOString()};
  else if(url.pathname==='/api/publication-config')data={enabled:false,telegram:{available:false,reason:'Destino de demonstração: envio bloqueado'},slots:['09:00','20:30'],serverNow:new Date().toISOString()};
  else if(url.pathname.startsWith('/api/dashboard/'))data={serverNow:new Date().toISOString(),stats:{approved:0,curation:0,publications:0,scheduled:0},distribution:[],weekly:[],channels:{telegram:{publications:0,prepared:0,scheduled:0},whatsapp:{publications:0,prepared:0,scheduled:0}},products:[],productTotal:0,page:0,more:false,productChannels:{},upcoming:[],attention:0,activity:[]};
  else if(url.pathname==='/api/workspace')data={products:[],offers:[],publications:[],logs:[],channelStatus:{},total:0,more:false,historyMore:false};
  else if(req.method()!=='GET')throw Error('Unexpected write '+url.pathname);else data={entries:[],rows:[],total:0,more:false};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));const consoleErrors:string[]=[];page.on('console',(m:any)=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,160));});let layouts=0;
 async function capture(name:string){try{await page.screenshot({animations:'disabled',path:out+'/'+name+'.png',timeout:5000});}catch{captureErrors.push(name);}}
 for(const brand of brands){
  row=inboxFixture();row.draft.operation=brand;product=reviewedExtensionProduct(row,{id:row.id,confirmed:true,inStock:true});
  await page.goto(origin+'/?brand='+brand+'&view=dashboards');try{await page.locator('.ml-extension-inbox').waitFor({timeout:15000});}catch(e){await page.screenshot({path:out+'/failure.png'});console.log('Synthetic QA diagnostics',errors,consoleErrors,(await page.locator('body').innerText()).slice(0,600),blocked,await page.evaluate(()=>(window as any).__fixtureStorage));throw e;}
  await page.evaluate(()=>{(window as any).chrome={runtime:{id:'fixture-extension',onMessage:{addListener(fn:unknown){(window as any).__extensionReceiver=fn;}}}};});
  await page.addScriptTag({path:'experiments/mercado-livre-extension/dropou-bridge.js'});
  const connected:any=await page.evaluate(()=>new Promise(resolve=>(window as any).__extensionReceiver({protocol:'dropou-ml-v1',command:'connect'},{id:'fixture-extension'},resolve)));assert.equal(connected.ok,true);assert.equal(connected.operation,brand);
  const receipt:any=await page.evaluate(({connectionId,payload}:any)=>new Promise(resolve=>(window as any).__extensionReceiver({protocol:'dropou-ml-v1',command:'receive',connectionId,payload},{id:'fixture-extension'},resolve)),{connectionId:connected.connectionId,payload:{requestId:row.request_id,originalUrl:row.original_url,candidateUrl:row.candidate_url,itemId:'MLB1234567890',review:'candidate'}});assert.equal(receipt.ok,true);assert.equal(receipt.status,'pending');
  await page.locator('.ml-extension-review').waitFor();
  for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,brand+'/'+width);assert.equal(await page.locator('.app-shell').getAttribute('data-operation'),brand);assert.equal(await page.evaluate(()=>{const media=document.querySelector('.ml-extension-product .product-media')!.getBoundingClientRect(),heading=document.querySelector('.ml-extension-product h3')!.getBoundingClientRect();return media.right<=heading.left&&media.width>0&&heading.width>0;}),true);await capture(brand+'-'+width);layouts++;}
  await page.getByLabel('Conferi anúncio, vendedor, variante, preço, foto e link gerado na minha conta de afiliado.').check();await page.getByRole('button',{name:'Conferir e abrir oferta',exact:true}).click();
  await page.getByRole('heading',{name:'Publicar oferta',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('.product-form').count(),0);assert.equal(await page.getByRole('button',{name:'Publicar agora',exact:true}).isDisabled(),true);
  await capture(brand+'-premium');layouts++;
 }
 assert.deepEqual(errors,[]);assert.ok(writes.every(p=>p==='/api/mercado-livre/extension'));writeFileSync(out+'/result.json',JSON.stringify({layouts,errors,captureErrors,simulatedWrites:writes.length,blockedRemoteRequests:blocked.length,realSends:0,fixture:true},null,2));console.log(layouts+' layouts; page/content protocol and premium modal passed with simulated APIs; screenshot failures: '+captureErrors.length+'; zero external sends.');
}finally{await context.close();await browser.close();}
