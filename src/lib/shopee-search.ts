import {dailyKeywords,type ShopeeConfig} from './shopee-automation';
import {channelProfiles} from './channel-profiles';
import type {OperationId} from './workspace-brands';
import {memberCurationProfile} from './member-curation';

/** Keep the previously verified Tech query first; explicit custom terms remain explicit. */
export function onDemandKeywords(brand:OperationId,config:ShopeeConfig,radar:Record<string,unknown>,raw:Record<string,unknown>,day:string){
 const terms=(value:unknown)=>Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==='string'&&v.trim().length>=2&&v.trim().length<=80).map(v=>v.trim()))].slice(0,50):[];
 const custom=terms(radar.keywords).length?terms(radar.keywords):terms(raw.keywords);
 if(brand==='dropou'&&!custom.length)return [...new Set(['gamer',...dailyKeywords(config,day)])].slice(0,3);
 const keywords=custom.length?custom:memberCurationProfile(brand)?.keywords||channelProfiles[brand as keyof typeof channelProfiles]?.keywords||[];
 const offset=Math.floor(Date.parse(day+'T00:00:00Z')/86400000);
 return Array.from({length:Math.min(3,keywords.length)},(_,i)=>keywords[(offset+i)%keywords.length]);
}
type PlanEntry={key:string;input:{limit:number;page:number;keyword?:string;categoryId?:number;listType:0|2;sortType:1|2}};
export function shopeeSearchPlan(c:ShopeeConfig,day:string):PlanEntry[]{
 const limit=c.batchSize,page=1;
 const popular={key:`popular:${dailyKeywords(c,day)[0]}:${c.listType}:${c.sortType}:${page}`,input:{keyword:dailyKeywords(c,day)[0],limit,page,listType:c.listType,sortType:c.sortType}};
 const keywords=dailyKeywords(c,day).map(keyword=>({key:`keyword:${keyword}:${c.listType}:${c.sortType}`,input:{keyword,limit,page:1,listType:c.listType,sortType:c.sortType}}));
 const categories=c.categoryIds.map(categoryId=>({key:`category:${categoryId}:${c.listType}:${c.sortType}`,input:{categoryId,limit,page:1,listType:c.listType,sortType:c.sortType}}));
 // A failed shape is not silently retried with weaker constraints. On a later
 // invocation, the durable request key lets the round continue to another source.
 const all:PlanEntry[]=c.searchMode==='popular'?[popular]:c.searchMode==='keywords'?keywords:c.searchMode==='categories'?categories:[...categories.slice(0,1),...keywords];
 const keyed=all.map(entry=>({...entry,key:`discovery:${entry.input.listType}:${entry.input.sortType}:${entry.input.page}:${entry.input.categoryId||0}:${entry.input.keyword||''}`}));
 return [...new Map(keyed.map(entry=>[entry.key,entry])).values()].slice(0,Math.max(1,Math.min(6,c.dailyLimit-c.times.length)));
}
