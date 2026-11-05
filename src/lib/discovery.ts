import {z} from 'zod';
import {discount,freshPrice,Product,productKey} from './domain';
export const discoveryCategories={tech:{label:'Informática',meli:'MLB1648'},games:{label:'Games',meli:'MLB1144'},phones:{label:'Celulares',meli:'MLB1051'},electronics:{label:'Eletrônicos',meli:'MLB1000'}} as const;
export const discoveryFiltersSchema=z.object({store:z.enum(['Todas','Mercado Livre','Shopee']),category:z.enum(['tech','games','phones','electronics']),minPrice:z.number().min(0).max(1000000),maxPrice:z.number().positive().max(1000000),minDiscount:z.number().min(0).max(100),limit:z.number().int().min(1).max(20)}).refine(f=>f.maxPrice>=f.minPrice,'Preço máximo deve ser maior ou igual ao mínimo');
export type DiscoveryFilters=z.infer<typeof discoveryFiltersSchema>;
export type SourceReport={store:Product['store'];state:'pending'|'available'|'denied'|'error';message:string;httpStatus?:number;found:number;discarded:number;errors:string[];checkedAt:string};
export type DiscoveryResult={products:Product[];sources:SourceReport[];requested:number;category:DiscoveryFilters['category'];searchedAt:string};
export function withRecordedHistory(products:Product[],history:Product[],now=Date.now()){
 return products.map(p=>{
  if(!p.source||!p.checkedAt)return p;
  const past=history.filter(h=>!h.demo&&h.store===p.store&&h.source?.provider===p.source!.provider&&h.source?.itemId===p.source!.itemId&&h.checkedAt===h.source.verifiedAt&&h.paymentMethod===p.paymentMethod&&Date.parse(h.checkedAt!)<Date.parse(p.checkedAt!)&&now-Date.parse(h.checkedAt!)<=30*86400000).sort((a,b)=>Date.parse(b.checkedAt!)-Date.parse(a.checkedAt!))[0];
  if(!past||past.price<=p.price)return p;
  return {...p,previousPrice:past.price,previousVerified:true,source:{...p.source,previousEvidence:'recorded_history' as const}};
 });
}
export function eligibleCandidates(items:Product[],f:DiscoveryFilters){
 const seen=new Set<string>();return items.filter(p=>{
  if(p.demo||!freshPrice(p)||p.inStock===false||p.price<f.minPrice||p.price>f.maxPrice)return false;
  if(f.minDiscount>0&&(discount(p)===null||discount(p)!<f.minDiscount))return false;
  const key=p.source?`${p.store}:${p.source.itemId}`:productKey(p);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,f.limit);
}
export const candidateSelectionSchema=z.object({category:z.enum(['tech','games','phones','electronics']),items:z.array(z.object({store:z.enum(['Mercado Livre','Shopee']),itemId:z.string().regex(/^MLB\d+$|^\d+$/)})).min(1).max(20)});
