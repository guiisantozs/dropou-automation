// Synthetic auth and intercepted APIs only; no production mutations/providers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import type {MirrorOffer} from '../src/lib/mirrored-offers';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Gui Santos/Documents/dropou-automation-main/.npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base='http://127.0.0.1:3000',id='00000000-0000-4000-8000-000000000001';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
const context=await browser.newContext({serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});let admin=true,available=true;
const time=new Date().toISOString();let items:MirrorOffer[]=[{id,brand_id:'dropou',source_channel_id:'123',message_id:101,message_kind:'photo',received_at:time,shop_id:'11',item_id:'22',canonical_url:'https://shopee.com.br/product/11/22',destination_chat_id:'-100999',state:'pending_review',product_name:'Produto oficial de demonstração com nome comprido',image_url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="88" height="88"%3E%3Crect x="16" y="8" width="56" height="72" fill="silver"/%3E%3C/svg%3E',price:120,price_max:130,checked_at:time,affiliate_url:'https://s.shopee.com.br/fixture-own',attempts:1,last_error:null,data_source:'api',version:4,duplicate_of:null}];
items.push({...items[0],id:'00000000-0000-4000-8000-000000000002',message_id:102,state:'failed',image_url:null,product_name:null,price:null,price_max:null,affiliate_url:null,last_error:'Cota de espelhamento atingida.',version:2});
const writes:string[]=[],errors:string[]=[];let combinations=0;
try{
 await context.addInitScript(({id}:{id:string})=>{const exp=Math.floor(Date.now()/1000)+7200,token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,exp,aud:'authenticated',role:'authenticated'}))+'.Zml4dHVyZQ';localStorage.setItem('sb-wqpdyfipjsnyzxktacqh-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-15T03:00:00Z'}}));},{id});
 await context.route('**/*',async(route:any)=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();const respond=(data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/api/operations')return respond({access:{admin,brands:['dropou','celulares']},operations:[{brand_id:'dropou',display_name:'Tech & Games'},{brand_id:'celulares',display_name:'Celulares & Gadgets'}]});
  if(url.pathname==='/api/mirrored-offers'){
   if(req.method()==='POST'){const c=req.postDataJSON();writes.push(c.action);const item=items.find(x=>x.id===c.id);if(item){assert.equal(item.version,c.version);item.version++;item.state=c.action==='ready'?'ready':c.action==='discard'?'discarded':c.action==='retry'?'identified':'pending_review';}return respond({ok:true});}
   if(url.searchParams.has('history'))return respond({events:[{id:'event',from_state:'processing',to_state:'pending_review',attempt:1,detail:null,created_at:time}]});
   const filter=url.searchParams.get('state'),rows=items.filter(i=>filter==='all'||filter==='history'&&['discarded','published'].includes(i.state)||filter==='pending'&&['received','identified','processing','affiliated','pending_review'].includes(i.state)||filter===i.state);
   return respond({available,items:available?rows:[],total:available?rows.length:0,more:false,admin,policy:{repeat_hours:24,mirror_daily_limit:10},...(!available?{error:'Fila persistente preparada. A migração incremental ainda precisa ser autorizada e aplicada.'}:{})});
  }
  assert.equal(req.method(),'GET','No unrelated mutation allowed');return respond({products:[],offers:[],publications:[],logs:[],rows:[],recent:[],channels:{},channelStatus:{},summary:{},total:0,more:false,historyMore:false});
 });
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));mkdirSync('outputs/telegram-mtproto/persistent-review/screenshots',{recursive:true});
 async function widths(label:string){for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,label+' overflow '+width);combinations++;if(width===375||width===1440)await page.screenshot({path:`outputs/telegram-mtproto/persistent-review/screenshots/${label}-${width}.png`,fullPage:true});}}
 await page.goto(base+'/?brand=dropou&view=mirrored-offers');await page.getByRole('heading',{name:'Ofertas espelhadas',exact:true}).waitFor();await page.getByText(items[0].product_name!,{exact:true}).waitFor();await widths('pending');
 const color=await page.locator('.app-shell').evaluate((e:Element)=>getComputedStyle(e).getPropertyValue('--primary'));
 await page.getByRole('button',{name:'Copiar link',exact:true}).click();await page.getByText('Link afiliado copiado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),items[0].affiliate_url);
 await page.getByRole('button',{name:'Ver histórico',exact:true}).first().click();await page.getByRole('list').last().waitFor();
 await page.getByRole('button',{name:'Revisar e marcar pronta',exact:true}).click();assert.equal(writes.length,0);await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(writes.length,0);
 await page.getByRole('button',{name:'Revisar e marcar pronta',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('button',{name:'Voltar para revisão',exact:true}).waitFor();await widths('ready');
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByText('Nova tentativa solicitada sob o orçamento de espelhamento.',{exact:true}).waitFor();
 await page.getByText('Política deste canal',{exact:true}).click();await page.getByLabel('Intervalo entre publicações do produto (horas)').fill('48');await page.getByRole('button',{name:'Salvar política',exact:true}).click();await page.getByText('Alteração salva.',{exact:true}).waitFor();
 assert.deepEqual(writes,['ready','retry','policy']);assert.equal(await page.locator('.app-shell').evaluate((e:Element)=>getComputedStyle(e).getPropertyValue('--primary')),color);
 admin=false;await page.reload();await page.getByText(items[0].product_name!,{exact:true}).waitFor();assert.equal(await page.getByText('Política deste canal',{exact:true}).count(),0);await widths('operator');
 available=false;await page.getByRole('button',{name:'Atualizar ofertas',exact:true}).click();await page.getByText('Fila persistente preparada.',{exact:false}).waitFor();await widths('migration-pending');
 await page.goto(base+'/?brand=celulares&view=mirrored-offers');await page.getByRole('heading',{name:'Ofertas espelhadas',exact:true}).waitFor();assert.equal((await page.locator('.app-shell').evaluate((e:Element)=>getComputedStyle(e).getPropertyValue('--primary'))).trim().toLowerCase(),'#00e5dd');await widths('other-channel');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({combinations,fixtureWrites:writes,errors,realMutations:0}));
}finally{await context.close();await browser.close();}
