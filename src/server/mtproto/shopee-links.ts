import {shopeeLinkHosts} from '../../lib/shopee-saved';
import {mtprotoShopeeLink} from './shopee-resolver';

export type LinkEntity={offset:number;length:number;url?:string};
export type ShopeeLinks={urls:string[];invalid:number;limited:boolean};
// Process text/caption only on demand after the controlled-source/live-window gate.
// Telegram entity offsets and JS slice both use UTF-16 units, including emoji.
export function extractShopeeLinks(text:string,entities:LinkEntity[]=[]):ShopeeLinks{
 const urls=new Set<string>();let invalid=0,limited=false;
 const add=(raw:string)=>{
  let value=raw.trim().replace(/[.,!?;:)\]}]+$/g,'');
  if(!/^https?:\/\//i.test(value))value='https://'+value;
  let url:URL;try{url=new URL(value);}catch{return;}
  if(!shopeeLinkHosts.includes(url.hostname))return;
  try{
   const parsed=mtprotoShopeeLink(value);
   if(urls.size<5)urls.add(parsed.canonical);else if(!urls.has(parsed.canonical))limited=true;
  }catch{invalid=Math.min(5,invalid+1);}
 };
 const bounded=text.slice(0,16384);
 for(const entity of entities.slice(0,100)){
  if(!Number.isSafeInteger(entity.offset)||!Number.isSafeInteger(entity.length)||entity.offset<0||entity.length<=0||entity.offset+entity.length>bounded.length)continue;
  add(entity.url??bounded.slice(entity.offset,entity.offset+entity.length));
 }
 for(const match of bounded.matchAll(/(?<![\w.@/-])(?:https?:\/\/|(?:www\.)?shopee\.com\.br\/|s\.shopee\.com\.br\/|shope\.ee\/|br\.shp\.ee\/)[^\s<>"'\\]+/gi))add(match[0]);
 return {urls:[...urls],invalid,limited:limited||text.length>16384||entities.length>100};
}
