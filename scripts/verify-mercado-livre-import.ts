// Explicit read-only probe. No database writes, offers, paid AI or publication.
import env from '@next/env';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mercadoLivreIdentity} from '../src/lib/mercado-livre-link';
import {resolveMercadoLivreLink} from '../src/server/mercado-livre/resolve-link';
import {importMercadoLivreData} from '../src/server/mercado-livre/import-core';
import {requestMercadoLivreImport} from '../src/server/mercado-livre/import-http';
env.loadEnvConfig(process.cwd());
const args=process.argv.slice(2),url=args.find(a=>a.startsWith('https://'));
if(!args.includes('--live')||!url)throw new Error('Uso explícito: npx tsx scripts/verify-mercado-livre-import.ts --live URL. Token opcional somente em MERCADO_LIVRE_ACCESS_TOKEN.');
let resolved=mercadoLivreIdentity(url),resolution:'identified'|'resolved'|'unavailable'=resolved.itemId||resolved.catalogId?'identified':'unavailable';
try{resolved=await resolveMercadoLivreLink(url);resolution=resolved.itemId||resolved.catalogId?'resolved':'unavailable';}catch{}
const token=process.env.MERCADO_LIVRE_ACCESS_TOKEN;
const result=await importMercadoLivreData({inputUrl:url,resolvedUrl:resolved.url,operation:'dropou'},async(path,resource)=>token?requestMercadoLivreImport(path,resource,token):{data:null,check:{resource,state:'configuration'}});
const evidence={checkedAt:new Date().toISOString(),inputHash:createHash('sha256').update(url).digest('hex'),host:new URL(url).hostname,itemId:resolved.itemId,catalogId:resolved.catalogId,resolution,authenticated:!!token,checks:result.checks,available:{name:!!result.product.name,image:!!result.product.image,price:result.product.price>0},affiliateState:result.product.mercadoLivreImport?.affiliateState,published:false,databaseWrites:false};
mkdirSync('outputs/mercado-livre-live',{recursive:true});const file='outputs/mercado-livre-live/'+evidence.checkedAt.replace(/[:.]/g,'-')+'.json';writeFileSync(file,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
