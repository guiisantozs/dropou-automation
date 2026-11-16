// Local Next + Chrome; all catalog data and writes below are synthetic fixtures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {emptyProduct} from '../src/lib/product-draft';
import {pricedDraftCaption} from '../src/lib/publication-copy';
import {workspaceBrands} from '../src/lib/workspace-brands';
import type {CatalogRow} from '../src/lib/catalog';
const {chromium}=createRequire(import.meta.url)('C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base='http://127.0.0.1:4201',out='outputs/catalog-review',stamp=new Date().toISOString(),now=Date.now(),day=86400000,errors:string[]=[],external:string[]=[],reads:string[]=[],writes:any[]=[];
let brand='dropou',rows:CatalogRow[]=[],active:CatalogRow|undefined,layouts=0;
function fixtures(b:string){brand=b;rows=['Headset Gamer TOT Driver V2 Rainbow, Drivers 40mm','Controle Sem Fio DualSense PS5, Vibração e Bluetooth','Teclado Mecânico Gamer K500 Switch Blue RGB ABNT2','Mouse Gamer T-DAGGER Major','Headset Gamer Havit H2002d','Controle Xbox One X'].map((name,i)=>{
 const id='10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),data={...emptyProduct(),id,operation:(b==='all'?'dropou':b) as any,name,shortName:undefined,niche:['Headsets','Consoles e jogos','Periféricos','Periféricos','Headsets','Consoles e jogos'][i],store:i===5?'Mercado Livre' as const:'Shopee' as const,price:[54.87,379.9,219.9,129.9,159.9,322.9][i],image:base+'/images/shopee-gaming-hero.webp',originalUrl:'https://shopee.com.br/product/1/'+(i+1),affiliateUrl:'https://shopee.com.br/product/1/'+(i+1),checkedAt:stamp,inStock:true,createdAt:stamp};
 return {id,brand_id:data.operation,data,kind:'product',entered_at:new Date(now-(i+1)*day).toISOString(),expires_at:new Date(now+(14-i-1)*day).toISOString(),pinned:i===0,curation_state:'approved',published_at:i<4?stamp:undefined,destinations:[{channel:'telegram',name:'Tech & Games',publishedAt:i<4?stamp:null,state:i<4?'published':'not_published'},{channel:'whatsapp',name:'Grupo Gamer',publishedAt:i===1?stamp:null,state:i===1?'published':'not_published'}]} as CatalogRow;
 });active=undefined;
}
mkdirSync(out+'/screenshots',{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const c=await browser.newContext({viewport:{width:1440,height:1080},serviceWorkers:'block'});await c.routeWebSocket('**/*',()=>{});
 await c.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const note=document.createElement('div');note.textContent='PRÉVIA LOCAL · DADOS SIMULADOS';note.style.cssText='position:fixed;bottom:4px;right:8px;z-index:99999;padding:4px 8px;border-radius:5px;background:#111;color:#fff;font:8px sans-serif;pointer-events:none';document.body.append(note);});});
 await c.addInitScript(`const id='20000000-0000-4000-8000-000000000001',exp=Math.floor(Date.now()/1000)+7200;const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,exp,aud:'authenticated',role:'authenticated'}))+'.Zml4dHVyZQ';localStorage.setItem('sb-dropou-preview-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-16T03:00:00Z'}}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value)=>{window.fixtureCopied=value;}}});`);
 await c.route('**/*',async(route:any)=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==base){external.push(u.hostname);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
  const body=req.method()==='GET'?undefined:req.postDataJSON(),scope=u.searchParams.get('brand');let result:any={};
  if(body){writes.push({path:u.pathname,body,scope});if(u.pathname==='/api/catalog'){rows=rows.map(r=>r.id===body.id?{...r,pinned:body.pinned}:r);result={id:body.id,pinned:body.pinned};}else throw Error('Unexpected write '+u.pathname);}
  else{reads.push(u.pathname+u.search);
   if(u.pathname==='/api/operations')result={access:{admin:true,brands:workspaceBrands.map(b=>b.id)},operations:[],profile:{firstName:'Fixture'}};
   else if(u.pathname==='/api/catalog'){let list=rows;if(u.searchParams.get('q'))list=list.filter(r=>r.data.name.toLowerCase().includes(u.searchParams.get('q')!.toLowerCase()));if(u.searchParams.get('pinned')==='true')list=list.filter(r=>r.pinned);result={rows:list,total:list.length,page:0,more:false,serverNow:stamp,categories:['Headsets','Periféricos','Consoles e jogos']};}
   else if(/^\/api\/catalog\/[^/]+\/history$/.test(u.pathname))result={entries:active?.published_at?[{id:'fixture',channel:'telegram',destination:'Tech & Games',occurred_at:stamp,source:'telegram_receipt'}]:[],more:false,total:active?.published_at?1:0,destinations:active?.destinations||rows[0].destinations};
   else if(u.pathname.endsWith('/offer')){active=rows.find(r=>u.pathname.includes(r.id));assert.ok(active);const p=active.data;result={product:p,offer:{id:p.id,product_id:p.id,snapshot:p,caption:pricedDraftCaption(p),original_caption:pricedDraftCaption(p),status:'pronto',created_at:stamp,updated_at:stamp},serverNow:stamp,channels:{telegram:{published:!!active.published_at,state:active.published_at?'sent':'ready'},whatsapp:{published:false,state:'ready'}}};}
   else if(u.pathname==='/api/publication-config')result={enabled:false,slots:['09:00'],serverNow:stamp,telegram:{available:true,id:'-100fixture',title:'Tech & Games',key:'a'.repeat(64)},whatsapp:{name:'Grupo Gamer'}};
   else if(u.pathname.endsWith('/channels'))result={options:[]};
   else if(u.pathname==='/api/publication-history')result={entries:[],counts:{},more:false};
   else throw Error('Unexpected read '+u.pathname);
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const p=await c.newPage();p.on('pageerror',(e:Error)=>errors.push(e.message));
 for(const b of ['dropou','celulares','bruto','moda','tenis','automoto','beleza','casa','natal','all']){
  fixtures(b);await p.goto(base+'/?brand='+b+'&view=catalog');await p.locator('.catalog-product-row').first().waitFor();assert.equal(await p.locator('.catalog-product-row').count(),6);assert.equal(await p.locator('.saved-products-grid').count(),0);
  for(const width of [320,375,768,1440]){await p.setViewportSize({width,height:1080});await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow '+b+width);const bad=await p.locator('.catalog-product-photo img').evaluateAll((images:any[])=>images.some(i=>!i.complete||!i.naturalWidth));assert.equal(bad,false);layouts++;if([375,1440].includes(width))await p.screenshot({path:out+`/screenshots/catalog-${b}-${width}.png`,fullPage:true});}
 }
 fixtures('dropou');await p.setViewportSize({width:1440,height:1080});await p.goto(base+'/?brand=dropou&view=catalog');await p.locator('.catalog-product-row').first().waitFor();
 await p.getByRole('searchbox',{name:'Buscar produto'}).fill('DualSense');await p.waitForTimeout(500);assert.equal(await p.locator('.catalog-product-row').count(),1);await p.reload();await p.locator('.catalog-product-row').first().waitFor();assert.equal(await p.getByRole('searchbox',{name:'Buscar produto'}).inputValue(),'DualSense');
 await p.getByRole('searchbox',{name:'Buscar produto'}).fill('');await p.waitForTimeout(500);const row=p.locator('.catalog-product-row').first();await row.locator('.catalog-row-menu summary').click();await p.getByRole('button',{name:/Desafixar produto:/}).first().click();assert.equal(writes.length,1);assert.equal(writes[0].scope,'dropou');assert.equal(writes[0].body.pinned,false);assert.equal(await row.locator('.catalog-pinned-label').count(),0);
 await row.getByRole('button',{name:'Republicar',exact:true}).click();await p.getByRole('dialog').waitFor();await p.getByText('Republicar esta oferta',{exact:true}).waitFor();assert.equal(await p.getByRole('checkbox',{name:/Conferi preço, disponibilidade/}).isChecked(),false);assert.equal(await p.getByRole('button',{name:'Publicar agora',exact:true}).isDisabled(),true);assert.ok((await p.locator('.catalog-repost-context').innerText()).includes('Grupo Gamer'));assert.equal(writes.length,1);await p.screenshot({path:out+'/screenshots/repost-1440.png',fullPage:true});await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'hidden'});assert.ok(p.url().includes('view=catalog'));
 await row.locator('.catalog-publication-date button').click();await p.getByRole('heading',{name:'Histórico por destino',exact:true}).waitFor();await p.getByRole('dialog').getByText('Tech & Games',{exact:true}).waitFor();await p.keyboard.press('Escape');assert.equal(writes.length,1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const forbiddenId='10000000-0000-4000-8000-000000000001';
 const guards=[
  {path:'/api/catalog?brand=dropou',status:401},
  {path:'/api/catalog?brand=dropou',token:'fixture-member',status:403},
  {path:'/api/catalog?brand=all',token:'fixture-member',status:403},
  {path:'/api/catalog?brand=casa&operation=dropou',token:'fixture-member',status:403},
  {path:'/api/catalog?brand=casa',method:'PATCH',token:'fixture-member',body:{id:forbiddenId,kind:'product',pinned:true},status:403},
  {path:'/api/catalog/'+forbiddenId+'/history?brand=casa',token:'fixture-member',status:403},
  {path:'/api/catalog/'+forbiddenId+'/history?brand=casa',status:401},
  {path:'/api/operations?brand=all&summary=true',token:'fixture-admin',status:200},
 ];
 for(const check of guards){const r=await fetch(base+check.path,{method:check.method||'GET',headers:{...(check.token?{Authorization:'Bearer '+check.token}:{}),'Content-Type':'application/json'},body:check.body?JSON.stringify(check.body):undefined});assert.equal(r.status,check.status,check.path);}
 writeFileSync(out+'/result.json',JSON.stringify({layouts,errors,external,reads,writes,httpGuards:guards.length,fixtures:true},null,2));console.log(JSON.stringify({layouts,errors,external,httpGuards:guards.length,checks:'filter/reload/local pin/repost confirmation/history/Escape passed'}));
 await c.close();
}finally{await browser.close();}
