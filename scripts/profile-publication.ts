import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createElement,act,Profiler} from 'react';
import {createRoot} from 'react-dom/client';
import ProductForm from '../src/components/product-form';
import {emptyProduct} from '../src/lib/product-draft';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,Image:dom.window.Image,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{value,configurable:true});
let adds=0,removes=0,commits=0,duration=0,decodes=0,requests=0;
const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
window.addEventListener=((type:string,...args:any[])=>{if(type==='paste')adds++;return (add as any)(type,...args);}) as typeof add;
window.removeEventListener=((type:string,...args:any[])=>{if(type==='paste')removes++;return (remove as any)(type,...args);}) as typeof remove;
globalThis.fetch=async()=>{requests++;throw new Error('Offline profiling fixture');};
Object.defineProperty(dom.window.HTMLImageElement.prototype,'decode',{value:async()=>{decodes++;}});
const product=emptyProduct();
for(let cycle=0;cycle<10;cycle++){
 const root=createRoot(document.getElementById('root')!);
 for(let update=0;update<6;update++){await act(async()=>root.render(createElement(Profiler,{id:'form',onRender:(_id,_phase,ms)=>{commits++;duration+=ms;}},createElement(ProductForm,{product,onClose:()=>{},onSave:async()=>{}}))));
 if(update===0){for(let tick=0;!document.querySelector('.print-paste-area')&&tick<100;tick++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(!document.querySelector('.print-paste-area'))throw new Error('Image input did not mount');}
 }
 await act(async()=>root.unmount());
}
const html=readFileSync('.next/server/app/index.html','utf8');
const chunks=[...new Set([...html.matchAll(/src="(\/_next\/static\/[^"?]+\.js)/g)].map(m=>'.next/'+m[1].slice('/_next/'.length)))];
const result={environment:'React development Profiler in jsdom; ten new-form open/close cycles, six parent renders each. Not browser latency or a memory heap snapshot.',commits,totalProfilerMs:Math.round(duration),pasteListenerAdds:adds,pasteListenerRemoves:removes,remainingPasteListeners:adds-removes,imageDecodes:decodes,networkRequests:requests,initialDashboardJsBytes:chunks.reduce((n,p)=>n+statSync(p).size,0),initialDashboardJsGzipBytes:chunks.reduce((n,p)=>n+gzipSync(readFileSync(p)).length,0)};
writeFileSync(process.argv[2]||'docs/performance-before.json',JSON.stringify(result,null,2)+'\n');
console.log(result);dom.window.close();
