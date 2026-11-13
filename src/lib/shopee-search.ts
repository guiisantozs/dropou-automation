import {dailyKeywords,type ShopeeConfig} from './shopee-automation';
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
