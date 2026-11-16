// Real Next UI with synthetic account/APIs. HTTP writes and external connections blocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import type {GeneralDashboardData} from '../src/lib/general-dashboard';
import {pricedDraftCaption} from '../src/lib/publication-copy';
const {chromium}=createRequire(import.meta.url)('C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const brands=['dropou','celulares','tenis','automoto','bruto','moda'] as const,base='http://127.0.0.1:4194',out='outputs/operation-dashboard-review';
const general:GeneralDashboardData=JSON.parse(readFileSync('outputs/general-dashboard-review/data.json','utf8'));
const fixtures=Object.fromEntries(brands.map(brand=>{const data:GeneralDashboardData=JSON.parse(readFileSync(out+'/'+brand+'.json','utf8'));return [brand,{...data,products:(data.products.length?data.products:general.products.slice(0,2)).map(p=>({...p,operation:brand})),productTotal:30,more:true}];}));
const reads:string[]=[],writes:string[]=[],external:string[]=[],errors:string[]=[];
let fail=false,empty=false,layouts=0;
mkdirSync(out+'/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
 await context.routeWebSocket('**/*',()=>{});
 await context.addInitScript(`const id='00000000-0000-4000-8000-000000000001',exp=Math.floor(Date.now()/1000)+7200;const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replaceAll('=','')+'.'+btoa(JSON.stringify({sub:id,exp,aud:'authenticated',role:'authenticated'})).replaceAll('=','')+'.Zml4dHVyZQ';localStorage.setItem('sb-dropou-preview-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-16T03:00:00Z'}}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value)=>{window.fixtureCopied=value;}}});`);
 await context.route('**/*',async(route:any)=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==base){external.push(u.hostname);return route.abort();}
  if(!u.pathname.startsWith('/api/'))return route.continue();if(req.method()!=='GET'){writes.push(u.pathname);return route.abort();}
  reads.push(u.pathname+u.search);const brand=u.searchParams.get('brand')||req.headers()['x-dropou-brand'];let response:unknown={};
  if(u.pathname==='/api/operations')response={access:{admin:true,brands},operations:[]};
  else if(u.pathname.startsWith('/api/dashboard/')){
   assert.ok(brand);assert.equal(u.pathname,brand==='all'?'/api/dashboard/general':'/api/dashboard/operation');
   if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha temporária · fixture'})});
   const source=brand==='all'?general:fixtures[brand!],page=Number(u.searchParams.get('page')||0);
   response=empty?{...source,products:[],productTotal:0,more:false,stats:{approved:0,curation:0,publications:0,scheduled:0},operationSummary:source.operationSummary?{recent:0,catalog:0}:undefined,distribution:source.distribution.map((s:any)=>({...s,value:0})),weekly:source.weekly.map((d:any)=>({...d,telegram:0,whatsapp:0})),upcoming:[],activity:[]}: {...source,page,products:page?source.products.slice(0,1):source.products,more:page===0};
  }
  else if(/^\/api\/products\/[^/]+\/offer$/.test(u.pathname)){
   const p=fixtures[brand!].products.find((p:any)=>u.pathname.includes(p.id));assert.ok(p);assert.equal(p.operation,brand);
   response={product:p,offer:{id:p.id,product_id:p.id,snapshot:p,caption:pricedDraftCaption(p),status:'pronto',created_at:p.createdAt,updated_at:p.createdAt},serverNow:general.serverNow,channels:{telegram:{published:false,publishedAt:null,state:'ready',scheduledAt:null},whatsapp:{published:false,publishedAt:null,state:'ready',scheduledAt:null}}};
  }
  else if(u.pathname==='/api/product-operations')response={rows:[],total:0,more:false,recent:[],channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}};
  else if(u.pathname==='/api/workspace')response={products:[],offers:[],publications:[],logs:[],channelStatus:{},total:0,more:false,historyMore:false,summary:{products:0,published:0,scheduled:0,waiting:0}};
  else throw Error('Unexpected API '+u.pathname);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 const tokens=()=>page.locator('.app-shell').evaluate((el:HTMLElement)=>Object.fromEntries(['--primary','--canvas','--surface','--ink','--ink-muted','--border','--sidebar-bg','--chart-1'].map(k=>[k,getComputedStyle(el).getPropertyValue(k).trim().toUpperCase()])));
 for(const brand of [...brands,'all']){
  for(const isEmpty of [false,true]){
   empty=isEmpty;await page.goto(base+'/?brand='+brand+'&view=dashboard');await page.locator('.general-dashboard').waitFor();
   assert.equal(await page.locator('.general-primary-grid>.general-panel').count(),3);
   assert.equal(await page.locator('.general-secondary-grid>section').count(),3);
   const theme=await tokens();assert.equal(theme['--primary'],brand==='all'?'#202020':brand==='dropou'?'#00F0FF':brand==='celulares'?'#00E5DD':'#FF6A1A');
   if(brand==='dropou')assert.equal(theme['--canvas'],'#0A0E27');
   if(brand==='celulares'){assert.equal(theme['--canvas'],'#080E11');assert.equal(theme['--surface'],'#101B20');}
   for(const width of [320,375,768,1440]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,brand+' overflow '+width);
    if(width===1440){const boxes=await page.locator('.general-primary-grid>.general-panel').evaluateAll((els:Element[])=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));assert.ok(boxes.every((b:{y:number})=>Math.abs(b.y-boxes[0].y)<2));assert.ok(boxes[0].right<boxes[1].x&&boxes[1].right<boxes[2].x);}
    layouts++;
    if(['dropou','celulares','all'].includes(brand)&&[375,1440].includes(width))await page.screenshot({path:`${out}/screenshots/${brand}-${isEmpty?'empty':'populated'}-${width}.png`,fullPage:true});
   }
   assert.deepEqual(await tokens(),theme,'responsive layout must not rewrite theme tokens');
  }
 }
 empty=false;await page.goto(base+'/?brand=dropou&view=dashboard');await page.locator('.general-product').first().waitFor();
 assert.ok(!reads.some(r=>r.startsWith('/api/workspace')||r.startsWith('/api/channel-funnels')),'dashboard avoids duplicate legacy reads');
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();assert.match(await page.locator('.general-chart-total').innerText(),/18/);await page.getByRole('button',{name:'Todos',exact:true}).click();
 await page.getByText('Ver dados da semana',{exact:true}).click();assert.equal(await page.locator('.general-chart-data tbody tr').count(),7);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar atividade',exact:true}).click();const csv=await download;assert.match(readFileSync(await csv.path(),'utf8'),/Telegram \(recibo\);WhatsApp \(confirmação manual\)/);
 const card=page.locator('.general-product').first();await card.getByRole('button',{name:/Copiar para WhatsApp:/}).click();await page.waitForFunction(()=>!!(window as any).fixtureCopied);assert.equal(await page.evaluate(()=>(window as any).fixtureCopied),pricedDraftCaption(fixtures.dropou.products[0]));
 for(const intent of ['telegram','schedule']){const link=card.getByRole('link',{name:intent==='telegram'?/Publicar no Telegram:/:/Agendar:/});const href=new URL(await link.getAttribute('href'),base);assert.equal(href.searchParams.get('brand'),'dropou');assert.equal(href.searchParams.get('action'),intent);assert.equal(href.searchParams.get('returnTo'),'/?brand=dropou&view=dashboard');}
 await page.getByRole('button',{name:'Próxima página de ofertas'}).click();await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 2'));await page.reload();await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 2'));
 await page.goto(base+'/?brand=celulares&view=dashboard');await page.waitForFunction(()=>document.querySelector('.general-pagination')?.textContent?.includes('Página 1'));
 fail=true;await page.getByRole('button',{name:'Atualizar dashboard'}).click();await page.locator('.general-error').waitFor();assert.match(await page.locator('.general-error').innerText(),/dados anteriores permanecem visíveis/);fail=false;await page.getByRole('button',{name:'Tentar novamente'}).click();await page.waitForFunction(()=>!document.querySelector('.general-error'));
 await page.goto(base+'/?brand=dropou&view=dashboard');await page.locator('.general-dashboard').waitFor();await page.locator('.general-mini-stats button').first().click();await page.locator('.product-operations').waitFor();assert.ok(reads.some(r=>r.includes('brand=dropou')&&r.includes('stage=curation')));
 assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 writeFileSync(out+'/live-result.json',JSON.stringify({layouts,reads:reads.length,writes,external,errors},null,2));
 console.log(layouts+' layouts passed: six operations + all, populated/empty, original themes/new Tech palette, shared grids, chart/table/export, scoped copy/deep links, pagination/restoration/isolation, errors and curation navigation. No writes/external requests.');
 await context.close();
}catch(e){for(const p of browser.contexts().flatMap((c:any)=>c.pages()))console.log((await p.locator('body').innerText()).slice(0,1800));console.log(JSON.stringify({reads:reads.slice(-12),writes,external,errors}));throw e;}finally{await browser.close();}
