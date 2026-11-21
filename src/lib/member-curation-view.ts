import {z} from 'zod';
import {memberClassification} from './member-curation';
import type {OperationId} from './workspace-brands';

export const memberViewSchema=z.object({
 category:z.string().max(80).default('all'),
 sort:z.enum(['relevance','sales','rating','price']).default('relevance'),
 minPrice:z.coerce.number().min(0).max(1e6).optional(),
 maxPrice:z.coerce.number().min(0).max(1e6).optional(),
 minRating:z.coerce.number().min(0).max(5).optional(),
 minSales:z.coerce.number().int().min(0).max(1e9).optional(),
}).refine(v=>v.minPrice===undefined||v.maxPrice===undefined||v.minPrice<=v.maxPrice,'Faixa de preço inválida');
type Row={id:string;data:{name:string;price?:number;rating?:number|null;sales?:number|null};assessment?:{category:string;score:number};score?:number};
/** Applied to the complete scoped cache before pagination. Unknown metrics never become zero. */
export function memberCurationView<T extends Row>(rows:T[],operation:OperationId,filters:z.infer<typeof memberViewSchema>){
 const value=(row:T,key:'price'|'rating'|'sales')=>{const n=row.data[key];return typeof n==='number'&&Number.isFinite(n)?n:null;};
 const filtered=rows.filter(row=>{
  const category=row.assessment?.category||memberClassification(row.data.name,operation)?.category;
  const price=value(row,'price'),rating=value(row,'rating'),sales=value(row,'sales');
  return (filters.category==='all'||category===filters.category)
   &&(filters.minPrice===undefined||price!==null&&price>=filters.minPrice)
   &&(filters.maxPrice===undefined||price!==null&&price<=filters.maxPrice)
   &&(filters.minRating===undefined||rating!==null&&rating>=filters.minRating)
   &&(filters.minSales===undefined||sales!==null&&sales>=filters.minSales);
 });
 return filtered.sort((a,b)=>{
  if(filters.sort==='relevance')return (b.assessment?.score??b.score??0)-(a.assessment?.score??a.score??0)||a.id.localeCompare(b.id);
  const key=filters.sort==='price'?'price':filters.sort==='rating'?'rating':'sales',av=value(a,key),bv=value(b,key);
  return av===null?(bv===null?a.id.localeCompare(b.id):1):bv===null?-1:(filters.sort==='price'?av-bv:bv-av)||a.id.localeCompare(b.id);
 });
}
