import {celularFacts,type CelularCategory,type CelularSort} from './celulares-curation';
import type {OfferAssessment} from './shopee-quality';
export function celularesView<T extends {data:{name:string;price?:number;sales?:number|null;rating?:number|null};assessment?:OfferAssessment}>(rows:T[],category:CelularCategory|'all',sort:CelularSort){
 const selected=rows.filter(r=>category==='all'||(r.assessment?.mobile?.category||celularFacts(r.data.name).category)===category);
 if(sort==='relevance')return selected;
 const metric=(r:T)=>sort==='discount'?r.assessment?.discountSource==='observed'?r.assessment.observedDiscount:null:sort==='sales'?r.data.sales:sort==='rating'?r.data.rating:r.data.price;
 return selected.sort((a,b)=>{const av=metric(a),bv=metric(b),knownA=typeof av==='number'&&Number.isFinite(av),knownB=typeof bv==='number'&&Number.isFinite(bv);if(!knownA||!knownB)return Number(knownB)-Number(knownA);return sort==='price'?av-bv:bv-av;});
}
