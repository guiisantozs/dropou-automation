// Static previews from real components, with fixtures and no application backend.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const server=createServer(async(req,res)=>{try{const name=(req.url||'/dropou.html').slice(1);if(!/^[a-z]+\.html$/.test(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile('outputs/premium-review/'+name));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(4189,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 await mkdir('outputs/premium-review/screenshots',{recursive:true});
 const pages=(process.env.PREMIUM_PAGES||'dropou,bruto,moda,automation,catalog,posts,schedule,history,offer,empty,verification,quickschedule,saved,reviewed,operations,operationalcatalog,curation').split(',');let checks=0;
 for(const width of [320,375,768,1440]){const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const name of pages){await page.goto('http://127.0.0.1:4189/'+name+'.html');await page.evaluate(()=>document.fonts.ready);const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,bg:getComputedStyle(document.body).backgroundColor,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length}));assert.equal(state.overflow,false,name+' '+width+' horizontal overflow');assert.equal(state.bg,'rgb(11, 11, 13)');assert.equal(state.primary,'#FF6A1A');assert.equal(state.broken,0);assert.deepEqual(errors,[]);checks++;
   if(width===375||width===1440)await page.screenshot({path:'outputs/premium-review/screenshots/'+name+'-'+width+'.png',fullPage:true});
   if(name==='saved'){
    await page.locator('.saved-product-photo img').evaluateAll(async images=>await Promise.all(images.map(async img=>{img.loading='eager';await img.decode();})));
    await page.locator('.saved-product-card').last().scrollIntoViewIfNeeded();
    const geometry=await page.locator('.saved-product-card').evaluateAll(cards=>cards.map(card=>{const slot=card.querySelector('.saved-product-photo').getBoundingClientRect(),title=card.querySelector('h3').getBoundingClientRect(),price=card.querySelector('.saved-product-price')?.getBoundingClientRect();return {titleClear:title.top>=slot.bottom,titleVisible:title.height>0,priceClear:!price||price.top>=title.bottom-1,images:[...card.querySelectorAll('.saved-product-photo img')].map(img=>{const r=img.getBoundingClientRect();return img.complete&&img.naturalWidth>0&&r.top>=slot.top&&r.bottom<=slot.bottom+1&&r.left>=slot.left&&r.right<=slot.right+1;})};}));
    for(const result of geometry){assert.equal(result.titleClear,true,'photo overlaps title '+width);assert.equal(result.titleVisible,true);assert.equal(result.priceClear,true);assert.ok(result.images.every(Boolean),'image must remain within its slot '+width);}
    await page.locator('.saved-product-card').first().scrollIntoViewIfNeeded();
   }
   if(name==='automation'){await page.locator('.automation-details').first().locator('summary').first().click();assert.equal(await page.locator('.automation-details').first().evaluate(e=>e.open),true);await page.screenshot({path:'outputs/premium-review/screenshots/automation-details-'+width+'.png',fullPage:true});}
  }await page.close();
 }
 console.log(checks+' fixture pages passed: dark theme, 320/375/768/1440 px, no overflow, images, console and native details.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
