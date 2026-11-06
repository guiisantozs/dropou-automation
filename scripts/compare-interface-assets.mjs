import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const origin='https://dropou-automation.vercel.app';
const response=await fetch(origin);if(!response.ok)throw new Error('Baseline unavailable');
const beforeHtml=await response.text(),afterHtml=readFileSync('.next/server/app/index.html','utf8');
const paths=(html,kind)=>[...new Set([...html.matchAll(kind==='css'?/href="(\/_next\/static\/[^"?]+\.css)/g:/src="(\/_next\/static\/[^"?]+\.js)/g)].map(m=>m[1]))];
const output={method:'Public production assets read without executing JS; local build assets. Gzip sizes estimated identically from decoded bytes, not measured browser transfer.',before:{},after:{}};
for(const kind of ['js','css']){let raw=0,gzip=0;for(const path of paths(beforeHtml,kind)){const r=await fetch(new URL(path,origin));if(!r.ok)throw new Error('Baseline asset unavailable');const bytes=Buffer.from(await r.arrayBuffer());raw+=bytes.length;gzip+=gzipSync(bytes).length;}output.before[kind]={raw,gzip};raw=0;gzip=0;for(const path of paths(afterHtml,kind)){const bytes=readFileSync('.next/'+path.slice('/_next/'.length));raw+=bytes.length;gzip+=gzipSync(bytes).length;}output.after[kind]={raw,gzip};}
writeFileSync('docs/redesign-assets.json',JSON.stringify(output,null,2)+'\n');console.log(output);
