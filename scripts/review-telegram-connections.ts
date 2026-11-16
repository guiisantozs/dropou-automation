// Browser QA of the real Next app with synthetic auth and intercepted integration commands.
// No account credentials, provider requests or real mutations are used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import type {MtprotoStatus,MtprotoCommand} from '../src/lib/telegram-mtproto';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Gui Santos/Documents/dropou-automation-main/.npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base=process.env.MTPROTO_REVIEW_URL||'http://127.0.0.1:4183',id='00000000-0000-4000-8000-000000000001';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
const context=await browser.newContext({serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});let admin=true,offline=false;
const initial=():MtprotoStatus=>({configured:true,workerOnline:true,status:'disconnected',step:null,error:null,selected:[],test:null,diagnostics:[],serverNow:new Date().toISOString()});
let status=initial();const channels=[{id:'123',title:'Fonte controlada de demonstração',controlled:true},{id:'456',title:'Canal acessível sem administração',controlled:false}];
const commands:string[]=[],errors:string[]=[];
try{
 await context.addInitScript(({id}:{id:string})=>{const exp=Math.floor(Date.now()/1000)+7200,token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,exp,aud:'authenticated',role:'authenticated'}))+'.Zml4dHVyZQ';localStorage.setItem('sb-wqpdyfipjsnyzxktacqh-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-15T03:00:00Z'}}));},{id});
 await context.route('**/*',async(route:any)=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
  const respond=(data:unknown,code=200)=>route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/api/operations')return respond({access:{admin,brands:['dropou','celulares']},operations:[{brand_id:'dropou',display_name:'Tech & Games'},{brand_id:'celulares',display_name:'Celulares & Gadgets'}]});
  if(url.pathname==='/api/telegram/connections'){
   if(!admin)return respond({error:'Somente administradores.'},403);
   if(req.method()==='GET')return respond({...status,workerOnline:!offline,status:offline&&status.status==='connected'?'error':status.status});
   const c=req.postDataJSON() as MtprotoCommand;commands.push(c.action);
   if(c.action==='login')status.step='code';
   if(c.action==='code'){assert.equal(c.code,'12345');status.step='password';}
   if(c.action==='password'){assert.equal(c.password,'senha-fixture-2FA');status.step=null;status.status='connected';}
   if(c.action==='channels')return respond({channels,more:false});
   if(c.action==='select')status.selected=channels.filter(channel=>c.ids.includes(channel.id));
   if(c.action==='test'){
    const start=Date.now();status.test={channelId:c.channelId,startedAt:new Date(start).toISOString(),expiresAt:new Date(start+600000).toISOString()};status.diagnostics=[{channel_id:c.channelId,message_id:42,kind:'photo',message_at:new Date(start+1000).toISOString(),received_at:new Date(start+1100).toISOString()}];
    const entry={id:'42:0',messageId:42,kind:'photo' as const,messageAt:new Date(start+1000).toISOString(),receivedAt:new Date(start+1100).toISOString(),state:'identified' as const,canonicalUrl:'https://shopee.com.br/product/123/456',shopId:'123',itemId:'456',catalog:{status:'found' as const,name:'Produto existente de demonstração',productId:'fixture-only'},error:null,repeatedInTest:false};
    status.shopee={available:true,expiresAt:new Date(start+3600000).toISOString(),limitReached:false,items:[{...entry,conversion:{state:'generated',affiliateUrl:'https://s.shopee.com.br/our-fixture',source:'api',error:null,product:{name:entry.catalog.name,image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="88" height="88"/%3E',price:150,priceMax:175,checkedAt:new Date(start+1100).toISOString()}}},{...entry,id:'43:0',messageId:43,kind:'text',itemId:'789',canonicalUrl:'https://shopee.com.br/product/123/789',catalog:{status:'missing'},conversion:{state:'error',affiliateUrl:null,source:null,product:null,error:'Limite diário de importação atingido.'}},{...entry,id:'44:0',messageId:44,state:'error',canonicalUrl:null,shopId:null,itemId:null,catalog:null,error:'Não foi possível resolver o link curto.'}]};
   }
   if(c.action==='stop'){status.test=null;status.diagnostics=[];if(status.shopee)status.shopee.items=[];}
   if(c.action==='disconnect')status=initial();
   return respond({ok:true,revocationConfirmed:true});
  }
  assert.equal(req.method(),'GET','Unexpected mutation outside the MTProto fixture');
  return respond({products:[],offers:[],publications:[],logs:[],rows:[],recent:[],channels:{},channelStatus:{},summary:{},total:0,more:false,historyMore:false});
 });
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));mkdirSync('outputs/telegram-mtproto/screenshots',{recursive:true});
 let combinations=0;
 async function widths(label:string){for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Horizontal overflow: '+label+' '+width);combinations++;if(width===375||width===1440)await page.screenshot({path:`outputs/telegram-mtproto/screenshots/${label}-${width}.png`,fullPage:true});}}
 await page.goto(base+'/?brand=dropou&view=telegram-connections');await page.getByRole('heading',{name:'Conexões Telegram',exact:true}).first().waitFor();await page.getByText('Worker: online',{exact:true}).waitFor();
 const color=await page.locator('.app-shell').evaluate((el:Element)=>getComputedStyle(el).getPropertyValue('--primary'));
 assert.equal(await page.getByRole('button',{name:'Solicitar código',exact:true}).isDisabled(),true);await widths('disconnected');
 await page.getByLabel('Telefone com código do país').fill('+5511999999999');await page.getByLabel('Sou titular desta conta', {exact:false}).check();await page.getByRole('button',{name:'Solicitar código',exact:true}).click();await page.getByLabel('Código de autenticação',{exact:true}).waitFor();await widths('code');
 await page.getByLabel('Código de autenticação',{exact:true}).fill('12345');await page.getByRole('button',{name:'Confirmar código',exact:true}).click();await page.getByLabel('Senha de verificação em duas etapas',{exact:true}).waitFor();await widths('password');
 await page.getByLabel('Senha de verificação em duas etapas',{exact:true}).fill('senha-fixture-2FA');await page.getByRole('button',{name:'Confirmar senha',exact:true}).click();await page.getByRole('button',{name:'Listar canais',exact:true}).waitFor();await page.getByRole('button',{name:'Listar canais',exact:true}).click();await page.getByLabel('Fonte controlada de demonstração',{exact:false}).check();await page.getByRole('button',{name:'Salvar seleção',exact:true}).click();await page.getByText('Seleção salva.',{exact:false}).waitFor();await widths('channels');
 await page.getByLabel('Fonte controlada',{exact:true}).selectOption('123');await page.getByLabel('Confirmo que esta fonte',{exact:false}).check();await page.getByRole('button',{name:'Iniciar teste',exact:true}).click();await page.getByRole('list',{name:'Mensagens recebidas'}).waitFor();await widths('received');
 await page.getByText('Produto existente de demonstração',{exact:true}).waitFor();assert.equal(await page.getByRole('list',{name:'Produtos identificados nas mensagens'}).locator('li').count(),3);await page.getByText('Não foi possível resolver o link curto.',{exact:true}).waitFor();
 await page.getByText('Link gerado',{exact:true}).waitFor();await page.getByText('Falha na conversão',{exact:true}).waitFor();await page.getByRole('button',{name:'Copiar link afiliado',exact:true}).click();await page.getByText('Link copiado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://s.shopee.com.br/our-fixture');
 const stored=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(!stored.includes('senha-fixture-2FA'));assert.equal(await page.locator('input[type=password]').count(),0);
 assert.equal(await page.locator('.app-shell').evaluate((el:Element)=>getComputedStyle(el).getPropertyValue('--primary')),color);
 await page.getByRole('button',{name:'Encerrar e limpar diagnóstico',exact:true}).click();await page.getByText('Teste encerrado e diagnósticos apagados.',{exact:true}).waitFor();assert.equal(await page.getByRole('list',{name:'Mensagens recebidas'}).count(),0);
 assert.equal(await page.getByRole('list',{name:'Produtos identificados nas mensagens'}).count(),0);
 offline=true;await page.getByRole('button',{name:'Atualizar estado',exact:true}).click();await page.getByText('Worker: indisponível',{exact:true}).waitFor();await widths('offline');offline=false;await page.getByRole('button',{name:'Atualizar estado',exact:true}).click();await page.getByRole('button',{name:'Desconectar conta',exact:true}).click();await page.getByRole('button',{name:'Confirmar desconexão',exact:true}).click();await page.getByRole('button',{name:'Solicitar código',exact:true}).waitFor();
 await page.goto(base+'/?brand=celulares&view=telegram-connections');await page.getByText('Worker: online',{exact:true}).waitFor();assert.equal((await page.locator('.app-shell').evaluate((el:Element)=>getComputedStyle(el).getPropertyValue('--primary'))).trim().toLowerCase(),'#00e5dd');await widths('celulares');
 assert.equal(await page.getByRole('heading',{name:'Ofertas Shopee · fila de teste',exact:true}).count(),0);
 admin=false;await page.goto(base+'/?brand=dropou&view=telegram-connections');await page.getByText('Somente administradores podem gerenciar conexões Telegram.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Solicitar código',exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(commands,['login','code','password','channels','select','test','stop','disconnect']);
 console.log(`Telegram connections: ${combinations} responsive states, code/2FA/select/live-metadata/stop/disconnect, offline, operator denial and channel themes passed using fixtures only.`);
}finally{await context.close();await browser.close();}
