import type {OperationId} from './workspace-brands';
import {assessOffer,diversifyOffers,offerFingerprint,type OfferObservation} from './shopee-quality';
import type {ShopeeConfig,ShopeeOffer} from './shopee-automation';

type Cached={id:string;shop_id:string;item_id:string;data:ShopeeOffer;decision:string;prepared_product_id?:string|null};
type Registered={id:string;data:{name:string;demo?:boolean};canonical_url:string;curation_state:string;archived_at:string|null};
export function curatedDiscovery(cache:Cached[],products:Registered[],publishedIds:Set<string>,config:ShopeeConfig,history:OfferObservation[],operation:OperationId='dropou'){
 const byId=new Map(products.map(p=>[p.id,p])),byCanonical=new Map(products.map(p=>[p.canonical_url,p]));
 const excluded=new Set(cache.filter(r=>['rejected','removed'].includes(r.decision)).map(r=>offerFingerprint(r.data.name)));
 for(const p of products)if(publishedIds.has(p.id)||p.curation_state==='rejected'||p.archived_at)excluded.add(offerFingerprint(p.data.name));
 const represented=new Set<string>(),candidates=[];
 for(const row of cache){
  const product=byId.get(row.prepared_product_id||'')||byCanonical.get(`shopee.com.br/product/${row.shop_id}/${row.item_id}`);
  if(product)represented.add(product.id);
  if(row.decision!=='found'||product&&(product.archived_at||product.curation_state!=='pending'||publishedIds.has(product.id)))continue;
  const assessment=assessOffer(row.data,config,history,operation);
  candidates.push({...row,kind:'cache' as const,assessment,eligible:assessment.eligible,reasons:assessment.reasons,score:assessment.score});
 }
 const selected=diversifyOffers(candidates,candidates.length,excluded,true);
 // Manually entered products remain available for explicit review. These are
 // user choices, not automatic provider recommendations.
 const manual=products.filter(p=>!p.archived_at&&p.curation_state==='pending'&&!p.data.demo&&!represented.has(p.id)&&!publishedIds.has(p.id)).map(p=>({id:p.id,data:p.data,kind:'product' as const,eligible:false,reasons:[],score:0}));
 return [...selected,...manual];
}
