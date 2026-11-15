// Actual Next/Chrome + actual Portuguese Tesseract. All API writes and OCR assets
// are fulfilled locally; never calls a provider, uploads to Storage or publishes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import type {Product} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Gui Santos/Documents/dropou-automation-main/.npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base='http://127.0.0.1:3000',owner='00000000-0000-4000-8000-000000000001',path=owner+'/00000000-0000-4000-8000-000000000002.jpg',out='outputs/screenshot-review';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors:string[]=[],mutations:string[]=[],blocked:string[]=[];let saved:Product|undefined,photo:Buffer|undefined,uploadedBrand='';
try{
 await context.addInitScript(({owner}:{owner:string})=>{const exp=Math.floor(Date.now()/1000)+7200,access_token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:owner,exp,aud:'authenticated',role:'authenticated'}))+'.Zml4dHVyZQ';localStorage.setItem('sb-wqpdyfipjsnyzxktacqh-auth-token',JSON.stringify({access_token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-15T03:00:00Z'}}));},{owner});
 await context.route('**/*',async(route:any)=>{
  const request=route.request(),url=new URL(request.url()),file=basename(url.pathname);
  if(url.hostname==='cdn.jsdelivr.net'){
   const local=file==='worker.min.js'?'node_modules/tesseract.js/dist/'+file:file==='por.traineddata.gz'?out+'/'+file:/^tesseract-core[\w.-]+$/.test(file)?'node_modules/tesseract.js-core/'+file:undefined;
   if(!local)throw new Error('Unexpected OCR asset '+url.pathname);
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:file.endsWith('.js')?'application/javascript':'application/octet-stream',body:readFileSync(local)});
  }
  if(url.origin!==base){blocked.push(url.hostname);return route.abort();}
  if(url.pathname==='/fixture-photo.jpg')return route.fulfill({contentType:'image/jpeg',body:photo});
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let response:unknown;
  if(request.method()!=='GET'){
   mutations.push(url.pathname);
   if(url.pathname==='/api/products/image'){
    uploadedBrand=url.searchParams.get('brand')||'';const data=await new Request(base,{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData(),file=data.get('file') as File;assert.equal(data.get('consent'),'true');assert.equal(file.type,'image/jpeg');photo=Buffer.from(await file.arrayBuffer());writeFileSync(out+'/processed.jpg',photo);response={path};
   }else if(url.pathname==='/api/products/affiliate-link')response={url:'https://meli.la/fixture',message:'Formato conferido na fixture.'};
   else if(url.pathname==='/api/products'){saved=request.postDataJSON();response={product:saved};}
   else if(url.pathname==='/api/offers')response={offer:{id:saved!.id,product_id:saved!.id,snapshot:saved,caption:request.postDataJSON().caption,status:'rascunho'}};
   else throw new Error('Unexpected mutation '+url.pathname);
  }else if(url.pathname==='/api/operations')response={access:{admin:true,brands:['dropou','celulares']},operations:[{brand_id:'celulares',display_name:'Celulares & Gadgets'}]};
  else if(url.pathname==='/api/ai/visual')response={enabled:false,model:'fixture-disabled',reason:'OCR local gratuito',estimates:[]};
  else if(/^\/api\/products\/[^/]+\/offer$/.test(url.pathname))response={product:saved,offer:{id:saved!.id,product_id:saved!.id,snapshot:saved,caption:formatCaption(saved!,'celulares'),status:'rascunho'},serverNow:new Date().toISOString(),jobs:[]};
  else if(url.pathname==='/api/products/image')response={url:base+'/fixture-photo.jpg'};
  else response={products:[],offers:[],jobs:[],entries:[],operations:[],total:0,more:false};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
 await page.goto(base+'/ofertas/nova?brand=celulares&link='+encodeURIComponent('https://meli.la/fixture'));await page.getByText('Adicionar print ou foto',{exact:true}).click();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800;const c=canvas.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,1280,800);c.fillStyle='#ffe600';c.fillRect(0,0,1280,60);c.fillStyle='#222';c.fillRect(230,176,422,440);c.fillStyle='#cde9ff';c.fillRect(245,196,392,395);c.fillStyle='#333';c.font='30px Arial';c.fillText('Smartphone Samsung Galaxy A55',820,150);c.fillText('Novo | +100 vendidos',820,215);c.fillText('Por R$ 1.899,90',820,300);c.fillText('Marca: Samsung',820,380);c.fillText('Modelo: A55',820,435);c.fillText('Cor: Azul',820,490);c.fillStyle='#111';c.fillRect(40,220,75,75);return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type=file]').setInputFiles({name:'mercado-livre.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('heading',{name:'Fotografia para a publicação'}).waitFor();await page.getByRole('textbox',{name:/^Nome completo do produto/}).waitFor({state:'visible',timeout:120000});
 assert.match(await page.getByRole('textbox',{name:/^Nome completo do produto/}).inputValue(),/Smartphone/i);
 assert.equal(await page.getByRole('textbox',{name:/^Preço principal/}).inputValue(),'1899,9');
 const processed=page.getByAltText('Fotografia recortada para a publicação');await processed.waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.screenshot-photo-result img') as HTMLImageElement;return image?.naturalWidth>0;});
 const dimensions=await processed.evaluate((img:HTMLImageElement)=>({width:img.naturalWidth,height:img.naturalHeight}));assert.ok(dimensions.width<800&&dimensions.height<700);assert.ok(dimensions.width>350&&dimensions.height>400);
 assert.equal(mutations.length,0);
 for(const width of [1440,768,375,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Overflow '+width);await page.screenshot({path:out+'/review-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 await page.getByLabel('Link de afiliado gerado no Mercado Livre',{exact:true}).fill('https://meli.la/fixture');await page.getByRole('checkbox',{name:/Gerei este link na minha conta/}).check();await page.getByRole('button',{name:'Usar este link de afiliado',exact:true}).click();await page.getByRole('heading',{name:'Link afiliado informado',exact:true}).waitFor();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Salvar produto e oferta',exact:true}).click();assert.match(await page.locator('.form-error[role=alert]').innerText(),/fotografia processada/);assert.ok(!photo);
 await page.getByRole('checkbox',{name:/Conferi a fotografia processada/}).check();await page.getByRole('button',{name:'Salvar produto e oferta',exact:true}).click();
 await page.getByRole('heading',{name:'Sua oferta está aqui'}).waitFor();assert.equal(uploadedBrand,'celulares');assert.equal(saved!.imagePath,path);assert.equal(saved!.image,'');assert.equal(saved!.thumbnailPath,undefined);assert.ok(photo);
 await page.locator('img[src*="fixture-photo.jpg"]').first().waitFor();
 assert.equal(mutations.filter(p=>p==='/api/products/image').length,1);assert.ok(!mutations.some(p=>p.includes('telegram')||p.includes('/ai/')));assert.deepEqual(errors,[]);
 writeFileSync(out+'/report.json',JSON.stringify({actualNext:true,actualPortugueseOcr:true,dimensions,viewportWidths:[1440,768,375,320],consentEnforced:true,operation:'celulares',privateStorageMocked:true,providerCalls:0,mutations,blocked,errors},null,2));
 console.log('Actual Next + Portuguese OCR passed: automatic full-capture reading, photo crop, responsive review, consent, scoped single upload, saved image and offer preview.');
}catch(error){const page=context.pages()[0];if(page){await page.screenshot({path:out+'/failure.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-4000),errors);}throw error;}finally{await context.close();await browser.close();}
