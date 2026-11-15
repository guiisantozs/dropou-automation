// Exercise the actual Next application with synthetic browser auth and intercepted APIs.
// Every external request and every mutation is blocked. Never reads real account data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {emptyProduct} from '../src/lib/product-draft';
import {pricedDraftCaption} from '../src/lib/publication-copy';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Gui Santos/Documents/dropou-automation-main/.npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base='http://127.0.0.1:3000',now=new Date().toISOString(),userId='00000000-0000-4000-8000-000000000001';
const products=Array.from({length:12},(_,i)=>({...emptyProduct(),id:'00000000-0000-4000-8000-'+String(i+10).padStart(12,'0'),operation:'celulares' as const,name:'Fone Bluetooth com microfone · exemplo '+(i+1),shortName:'Fone Bluetooth · exemplo '+(i+1),store:'Shopee' as const,price:149.9,inStock:true,checkedAt:now,status:'pronto' as const,affiliateUrl:'https://shopee.com.br/product/123/456',image:''}));
const offer=(product:typeof products[number])=>({id:product.id,product_id:product.id,snapshot:product,caption:pricedDraftCaption(product),status:'pronto',created_at:now,updated_at:now});
const emptyChannel={published:false,publishedAt:null,state:null,scheduledAt:null};
const job={id:products[0].id,product_id:products[0].id,offer_id:products[0].id,brand_id:'celulares',name:products[0].name,data:products[0],channel:'telegram',state:'queued',scheduled_at:new Date(Date.now()+3600000).toISOString(),destination_title:'Canal fictício',attempts:0,message_ids:[]};
const record={...job,product_name:products[0].name,snapshot:products[0],source:'telegram_receipt',status:'sent',occurred_at:now,recorded_at:now,destination:'Canal fictício',destination_id:null,confirmed_by:null,actor_id:null,actor_name:'Operador de exemplo',review_required:false,is_republication:false,publication_round:null,error:null,message_ids:['1']};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),reads:string[]=[],writes:string[]=[],errors:string[]=[];
try{
 await context.addInitScript(({userId}:{userId:string})=>{
  const exp=Math.floor(Date.now()/1000)+7200;
  const access_token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'})).replaceAll('=','')+'.'+btoa(JSON.stringify({sub:userId,exp,aud:'authenticated',role:'authenticated'})).replaceAll('=','')+'.Zml4dHVyZQ';
  localStorage.setItem('sb-wqpdyfipjsnyzxktacqh-auth-token',JSON.stringify({access_token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-15T03:00:00Z'}}));
 },{userId});
 await context.route('**/*',async(route:any)=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  reads.push(url.pathname+url.search);let response:unknown;
  if(url.pathname==='/api/operations')response={access:{admin:true,brands:['dropou','celulares','tenis','automoto']},operations:[{brand_id:'celulares',display_name:'Celulares & Gadgets'}]};
  else if(url.pathname==='/api/product-operations')response={rows:products.map(product=>({id:product.id,data:product})),total:36,page:Number(url.searchParams.get('page')||0),more:!url.searchParams.get('page')||url.searchParams.get('page')==='0',recent:[],recentTotal:0,channels:{},summary:{pending:5,approved:12,published:36,recent:2,archived:0}};
  else if(/^\/api\/products\/[^/]+\/offer$/.test(url.pathname)){const product=products.find(p=>url.pathname.includes(p.id))||products[0];response={product,offer:offer(product),serverNow:now,channels:{telegram:emptyChannel,whatsapp:emptyChannel}};}
  else if(url.pathname==='/api/publication-jobs')response={jobs:[job],channels:{},total:1,more:false,serverNow:now,summary:{today:1,pending:1,attention:0,next:job.scheduled_at}};
  else if(url.pathname==='/api/publication-records')response={entries:[record],total:1,more:false,serverNow:now,allowedBrands:['celulares'],admin:false,operators:[]};
  else if(url.pathname==='/api/publication-config')response={enabled:false,telegram:{available:false},slots:[],serverNow:now};
  else if(url.pathname==='/api/workspace')response={products:[],offers:[],publications:[],logs:[],channelStatus:{},total:0,more:false,historyMore:false};
  else if(url.pathname==='/api/ai/usage')response={requests:[],runs:[],enabled:false};
  else response={entries:[],jobs:[],products:[],operations:[],total:0,more:false};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
 await page.goto(base+'/?brand=celulares&view=catalog');try{await page.getByRole('heading',{name:'Catálogo de produtos',exact:true}).last().waitFor();}catch(error){console.log('Fixture page diagnostics:',(await page.locator('body').innerText()).slice(0,1200),errors,reads);throw error;}
 await page.getByLabel('Pesquisar',{exact:true}).fill('Fone');await page.getByLabel('Loja',{exact:true}).selectOption('Shopee');await page.getByRole('button',{name:'Aplicar filtros'}).click();
 await page.waitForFunction(()=>document.body.textContent?.includes('12')||document.querySelectorAll('.saved-product-card').length===12);
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.waitForFunction(()=>document.body.textContent?.includes('página 2'));
 const open=page.locator('.saved-product-card').nth(6).getByRole('button',{name:'Abrir oferta',exact:true});await open.scrollIntoViewIfNeeded();await open.click();
 await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/?brand=celulares&view=catalog');
 await page.getByRole('link',{name:'Voltar à lista',exact:true}).click();await page.waitForFunction(()=>document.body.textContent?.includes('página 2'));
 assert.equal(await page.getByLabel('Pesquisar',{exact:true}).inputValue(),'Fone');assert.equal(await page.getByLabel('Loja',{exact:true}).inputValue(),'Shopee');await page.waitForFunction(()=>window.scrollY>200);
 // Edit from preview returns to the preview, then to the originating catalog.
 await page.locator('.saved-product-card').first().getByRole('button',{name:'Abrir oferta',exact:true}).click();await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();
 await page.getByText('Mais opções do produto',{exact:true}).click();await page.getByRole('button',{name:'Editar / revalidar produto'}).click();await page.getByRole('link',{name:'Voltar à oferta',exact:true}).waitFor();
 await page.getByRole('link',{name:'Voltar à oferta',exact:true}).click();await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();await page.getByRole('link',{name:'Voltar à lista',exact:true}).click();await page.getByLabel('Pesquisar',{exact:true}).waitFor();
 // A newly created draft retains the same origin without saving any product.
 await page.getByRole('button',{name:'Criar nova oferta',exact:true}).click();await page.getByRole('link',{name:'Voltar à lista',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/ofertas/nova');await page.getByRole('link',{name:'Voltar à lista',exact:true}).click();
 // Browser Back also preserves the catalog origin and UI controls.
 await page.getByLabel('Pesquisar',{exact:true}).waitFor();await page.locator('.saved-product-card').first().getByRole('button',{name:'Abrir oferta',exact:true}).click();await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();await page.goBack();await page.getByLabel('Pesquisar',{exact:true}).waitFor();assert.equal(await page.getByLabel('Pesquisar',{exact:true}).inputValue(),'Fone');
 // History and schedule use the same return contract and client transitions.
 for(const view of ['publications','schedule']){
  await page.goto(base+'/?brand=celulares&view='+view);await page.getByRole('link',{name:'Abrir oferta',exact:true}).first().click();await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/?brand=celulares&view='+view);await page.getByRole('link',{name:'Voltar à lista',exact:true}).click();await page.waitForURL('**view='+view);await page.getByRole('link',{name:'Abrir oferta',exact:true}).first().waitFor();
 }
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.ok(reads.some(url=>url.includes('q=Fone')&&url.includes('page=1')));
 mkdirSync('outputs/premium-review/screenshots',{recursive:true});await page.screenshot({path:'outputs/premium-review/screenshots/live-navigation-schedule.png',fullPage:true});
 console.log('Actual Next app passed: catalog filters/page/scroll, preview-edit-preview, new draft, publication and schedule returns; zero mutations and external requests.');
}finally{await context.close();await browser.close();}
