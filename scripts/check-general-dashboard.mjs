import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/Usuario/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
mkdirSync('outputs/general-dashboard-review/screenshots',{recursive:true});
const results=[];
try{for(const width of [320,375,768,1024,1200,1440]){const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const state of ['populated','empty']){
  await page.goto('http://127.0.0.1:4193/'+(state==='empty'?'empty':''));await page.evaluate(()=>document.fonts.ready);
  const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,background:getComputedStyle(document.querySelector('.general-workspace')).backgroundColor,sidebar:getComputedStyle(document.querySelector('.general-sidebar')).backgroundColor,panels:[...document.querySelectorAll('.general-primary-grid>.general-panel')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}),products:[...document.querySelectorAll('.general-product')].map(e=>{const r=e.getBoundingClientRect(),h=e.querySelector('h3').getBoundingClientRect(),img=e.querySelector('.product-media').getBoundingClientRect();return {w:r.width,titleHeight:h.height,photoClear:img.right<=h.left+1,actionsFit:e.querySelector('.general-product-actions').scrollWidth<=r.width-28}}),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length}));
  assert.equal(check.overflow,false,state+' overflow at '+width);assert.equal(check.background,'rgb(241, 241, 241)');assert.equal(check.sidebar,'rgb(255, 255, 255)');assert.equal(check.broken,0);for(const p of check.products){assert.equal(p.photoClear,true);assert.equal(p.actionsFit,true,'product controls fit '+width);assert.ok(p.titleHeight<=40)}assert.deepEqual(errors,[]);
  if(width>=1200){assert.equal(Math.round(check.panels[0].y),Math.round(check.panels[2].y));assert.ok(check.panels[0].w>check.panels[1].w)}
  if(state==='populated'){await page.getByText('Ver dados da semana',{exact:true}).click();assert.equal(await page.locator('.general-chart-data').evaluate(e=>e.open),true);await page.getByText('Ver dados da semana',{exact:true}).click();await page.locator('.general-product-menu>summary').first().click();assert.equal(await page.locator('.general-product-menu').first().evaluate(e=>e.open),true);await page.locator('.general-product-menu>summary').first().click();}
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`outputs/general-dashboard-review/screenshots/${state}-${width}.png`,fullPage:true});results.push({width,state,...check});
 }await page.close();}
 writeFileSync('outputs/general-dashboard-review/visual-checks.json',JSON.stringify(results,null,2));console.log(results.length+' visual checks passed: real presentation components, no overflow, contained photos, compact controls, palette, details and empty state.');
}finally{await browser.close()}
