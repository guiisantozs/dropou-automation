// Real Next UI, synthetic account, local fixtures. All external requests and writes are blocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {pricedDraftCaption} from '../src/lib/publication-copy';
import type {GeneralDashboardData} from '../src/lib/general-dashboard';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const fixture:GeneralDashboardData=JSON.parse(readFileSync('outputs/general-dashboard-review/data.json','utf8'));
const base='http://127.0.0.1:4194',reads:string[]=[],writes:string[]=[],external:string[]=[],errors:string[]=[];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.routeWebSocket('**/*',()=>{});await context.addInitScript(`
  const id='00000000-0000-4000-8000-000000000001',exp=Math.floor(Date.now()/1000)+7200;
  const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replaceAll('=','')+'.'+btoa(JSON.stringify({sub:id,exp,aud:'authenticated',role:'authenticated'})).replaceAll('=','')+'.Zml4dHVyZQ';
  localStorage.setItem('sb-dropou-preview-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-16T03:00:00Z'}}));
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value)=>{window.fixtureCopied=value;}}});
 `);
 let failSummary=false;
 await context.route('**/*',async(route:any)=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(url.hostname);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}reads.push(url.pathname+url.search);
  let response:unknown={};
  if(url.pathname==='/api/operations')response={access:{admin:true,brands:['dropou','bruto','moda','celulares','tenis','automoto']},operations:[]};
  else if(url.pathname==='/api/dashboard/general'){
   if(failSummary)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Resumo temporariamente indisponível · fixture'})});
   const page=Number(url.searchParams.get('page')||0);response={...fixture,page,productTotal:30,more:page===0,products:page?fixture.products.slice(4):fixture.products};
  }
  else if(/^\/api\/products\/[^/]+\/offer$/.test(url.pathname)){
   const p=fixture.products.find(p=>url.pathname.includes(p.id))!;assert.equal(url.searchParams.get('brand'),p.operation);const caption=pricedDraftCaption(p);
   response={product:p,offer:{id:p.id,product_id:p.id,snapshot:p,caption,status:'pronto',created_at:p.createdAt,updated_at:p.createdAt},serverNow:fixture.serverNow,channels:{telegram:{published:false,publishedAt:null,state:'ready',scheduledAt:null},whatsapp:{published:false,publishedAt:null,state:'ready',scheduledAt:null}}};
  }
  else if(url.pathname==='/api/workspace')response={products:[],offers:[],publications:[],logs:[],channelStatus:{},total:0,more:false,historyMore:false,summary:{products:0,published:0,scheduled:0,waiting:0}};
  else if(url.pathname==='/api/product-operations')response={rows:[],total:0,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}};
  else if(url.pathname==='/api/publication-config')response={enabled:false,telegram:{available:false},slots:[],serverNow:fixture.serverNow};
  else if(url.pathname==='/api/publication-records')response={entries:[],total:0,more:false,allowedBrands:['dropou'],admin:true,operators:[],serverNow:fixture.serverNow};
  else if(url.pathname==='/api/team')response={access:{admin:true},activity:[],members:[]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.goto(base+'/?brand=all&view=dashboard');await page.getByRole('heading',{name:'Todas as operações',exact:true}).waitFor();await page.locator('.general-product').first().waitFor();
 assert.equal(await page.locator('.general-workspace').count(),1);assert.equal(await page.locator('.general-brand-mark.brand-whatsapp').count()>0,true);assert.equal(await page.evaluate(()=>document.fonts.check('500 13px DropouManrope')),true);
 assert.equal(await page.locator('.general-product').count(),6);assert.ok(!reads.some(p=>p.startsWith('/api/workspace')||p.startsWith('/api/channel-funnels')),'no duplicate legacy dashboard queries');
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();assert.match(await page.locator('.general-chart-total').innerText(),/18/);await page.getByRole('button',{name:'Todos',exact:true}).click();
 await page.locator('.general-product').first().getByRole('button',{name:/Copiar para WhatsApp:/}).click();await page.waitForFunction(()=>!!(window as any).fixtureCopied||!!document.querySelector('.toast'));assert.equal(await page.evaluate(()=>(window as any).fixtureCopied),pricedDraftCaption(fixture.products[0]),await page.locator('.toast').innerText());assert.match(await page.locator('.toast').innerText(),/envio.*manuais/);assert.equal(writes.length,0);
 const telegram=page.locator('.general-product').first().getByRole('link',{name:/Publicar no Telegram:/});const link=new URL(await telegram.getAttribute('href'),base);assert.equal(link.searchParams.get('brand'),'dropou');assert.equal(link.searchParams.get('action'),'telegram');assert.equal(link.searchParams.get('returnTo'),'/?brand=all&view=dashboard');
 await page.getByRole('button',{name:'Próxima página de ofertas'}).click();await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 2'));assert.equal(await page.locator('.general-product').count(),2);
 await page.reload();await page.locator('.general-product').first().waitFor();await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 2'));
 failSummary=true;await page.getByRole('button',{name:'Atualizar dashboard'}).click();await page.locator('.general-error').waitFor();assert.match(await page.locator('.general-error').innerText(),/dados anteriores permanecem visíveis/);assert.equal(await page.locator('.general-product').count(),2);failSummary=false;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.general-error'));
 await page.getByRole('button',{name:'Criar oferta',exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Em qual operação/);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Página anterior de ofertas'}).click();await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 1'));
 for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);mkdirSync('outputs/general-dashboard-review/screenshots',{recursive:true});await page.screenshot({path:'outputs/general-dashboard-review/screenshots/live-'+width+'.png',fullPage:true});}
 // Other operations retain the existing theme and never mount the consolidated dashboard.
 await page.goto(base+'/?brand=celulares&view=dashboard');await page.locator('[data-operation=celulares]').first().waitFor();assert.equal(await page.locator('.general-workspace').count(),0);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toUpperCase()),'#00E5DD');
 assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('Live Next fixture passed: consolidated reads, Manrope/logos, chart filters, fresh scoped WhatsApp copy, explicit Telegram deep link, pagination restoration, failure/recovery, create chooser, five responsive widths and Celulares theme isolation. Zero writes/external requests.');
 await context.close();
}finally{await browser.close();}
