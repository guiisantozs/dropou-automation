import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[],external=[];
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:4195'){external.push(u.hostname);return r.abort();}return r.continue();});mkdirSync('outputs/shopee-library-review/screenshots',{recursive:true});
 for(const state of ['populated','empty','pending'])for(const width of [320,375,600,768,1024,1200,1440,1920]){await page.setViewportSize({width,height:1080});await page.goto('http://127.0.0.1:4195/'+(state==='populated'?'':state));await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(async img=>{img.loading='eager';try{await img.decode();}catch{}}));});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+state+' '+width);
  assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.some(i=>!i.complete||!i.naturalWidth)),false,'broken image '+state+' '+width);
  assert.equal(await page.locator('.library-stats>article').count(),4);assert.equal(await page.locator('.library-widget').count(),3);
  const geometry=await page.locator('.library-product').evaluateAll(cards=>cards.map(card=>{const a=card.querySelector('.library-photo').getBoundingClientRect(),b=card.querySelector('h3').getBoundingClientRect(),p=card.querySelector('.library-product-state').getBoundingClientRect(),c=card.getBoundingClientRect();return {clear:b.left>=a.right-1&&b.right<=c.right+1&&p.right<=c.right+1,compact:c.height<210};}));assert.ok(geometry.every(c=>c.clear&&c.compact),'product geometry '+state+' '+width+JSON.stringify(geometry));
  if([320,375,768,1440].includes(width))await page.screenshot({path:'outputs/shopee-library-review/screenshots/'+state+'-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('24 static layouts passed: filled/empty/pending × 8 widths; four KPIs, three widgets, compact rows, no overlap/overflow/broken images/external requests.');
}finally{await browser.close();}
