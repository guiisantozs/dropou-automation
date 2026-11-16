import type {ShopeeOffer,ShopeeConfig} from './shopee-automation';
import type {OfferAssessment,OfferObservation,SalesTrend} from './shopee-quality';
import {celularFacts,celularBrand,celularCategories,celularLabels,defaultCelularesConfig,type CelularesConfig,type CelularFacts} from './celulares-curation';
export type CelularAssessment=CelularFacts&{comparison?:{equivalents:number;median:number;differencePercent:number};sellerReputation:null;ratingCount:number|null};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function assessCelular(o:ShopeeOffer,c:ShopeeConfig,history:OfferObservation[],trend:SalesTrend,policy:CelularesConfig=defaultCelularesConfig()):OfferAssessment{
 const facts=celularFacts(o.name,policy),reasons=[...facts.blocks],warnings:string[]=[],phone=facts.category==='smartphones';
 const sales=o.sales!==null&&Number.isSafeInteger(o.sales)&&o.sales>=0?o.sales:null,rating=o.rating!==null&&o.rating>=0&&o.rating<=5?o.rating:null;
 const validPrice=Number.isFinite(o.price)&&o.price>0&&Number.isFinite(o.priceMax)&&o.priceMax>=o.price&&o.price>=c.minPrice&&o.price<=c.maxPrice;
 if(!validPrice)reasons.push('Preço inválido ou fora da faixa configurada');
 if(o.priceMax!==o.price)reasons.push('Preço da variante da foto não comprovado; anúncio possui faixa de preços');
 if(sales===null||sales<(phone?policy.minPhoneSales:policy.minOtherSales))reasons.push('Vendas insuficientes ou não disponibilizadas');
 if(rating===null||rating<policy.minRating)reasons.push('Avaliação insuficiente ou não disponibilizada');
 const safeUrl=(raw:string,hosts:string[])=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}};
 if(!o.name.trim()||!safeUrl(o.image,['shopee.com.br','shopee.com','susercontent.com','shopeemobile.com'])||!safeUrl(o.offerLink,['shopee.com.br','shope.ee']))reasons.push('Nome, foto ou link de afiliado inválido');
 if(facts.category&&policy.weights[facts.category]===0)reasons.push('Categoria desabilitada na distribuição');
 const prior=history.filter(h=>h.shop_id===o.shopId&&h.item_id===o.itemId&&!!facts.variantKey&&h.variant_key===facts.variantKey&&h.price===h.price_max&&o.price===o.priceMax&&Date.parse(h.observed_at)<Date.parse(o.checkedAt)&&Date.parse(o.checkedAt)-Date.parse(h.observed_at)<=30*86400000).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];
 const observed=prior&&prior.price>o.price?Math.round((prior.price-o.price)/prior.price*1000)/10:null;
 // A provider percentage is not proof of a previous price or a verified discount.
 if(o.reportedDiscount!==null)warnings.push('Percentual da Shopee não comprova desconto; não influencia a ordenação por desconto verificado');
 if(!prior)warnings.push('Sem preço anterior da mesma variante identificado no histórico');
 if(phone&&!facts.condition)warnings.push('Condição não informada; não classificado como novo');
 if(phone&&!facts.storageGB)warnings.push('Armazenamento não identificado; comparação entre vendedores indisponível');
 warnings.push('Reputação do vendedor e autenticidade não comprovadas pelo contrato atual');
 const ratingCount=Number.isSafeInteger(o.ratingCount)&&o.ratingCount!>=0?o.ratingCount!:null;if(ratingCount===null)warnings.push('Quantidade de avaliações não disponibilizada');
 if(trend.perDay===null)warnings.push('Popularidade recente indisponível sem observações de dias diferentes');
 const brand=celularBrand(o.name),known=brand!=='Não identificada';
 const metrics={sales:sales===null?null:clamp(Math.log10(sales+1)/Math.log10((phone?1000:10000)+1)),rating:rating===null?null:clamp((rating-3)/2),relevance:facts.category?phone?1:.85:0,price:observed===null?null:clamp(observed/40),trend:trend.perDay===null?null:clamp(Math.log10(trend.perDay+1)/3)};
 const base={sales:30,rating:30,relevance:25,price:10,trend:5},available=Object.entries(metrics).reduce((n,[k,v])=>n+(v===null?0:base[k as keyof typeof base]),0);
 const weights=Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,v===null?0:base[k as keyof typeof base]*100/available])) as OfferAssessment['weights'];
 const components=Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,v===null?null:Math.round(v*weights[k as keyof typeof weights]*10)/10])) as OfferAssessment['components'];
 const score=Math.min(100,Math.round(Object.entries(metrics).reduce((n,[k,v])=>n+(v??0)*weights[k as keyof typeof weights],0))+(known&&sales!==null&&rating!==null?2:0));
 const confidence=(validPrice?10:0)+(o.name&&o.image&&o.offerLink?10:0)+(sales!==null?25:0)+(rating!==null?25:0)+(facts.model?5:0)+(facts.condition?5:0)+(observed!==null?10:0)+(trend.perDay!==null?10:0);
 if(confidence<Math.min(70,c.minConfidence)||score<c.minScore)reasons.push('Evidências ou pontuação insuficientes para recomendar');
 const recommended=!reasons.length;
 return {relevant:!!facts.category&&!facts.blocks.length,recommended,eligible:recommended,score,reasons,recommendationReasons:[...(phone?['Smartphone com modelo identificado']:[]),...(rating!==null&&rating>=policy.minRating?['Bem avaliado']:[]),...(sales!==null?[sales+' vendas informadas']:[]),...(observed!==null?['Queda de preço da mesma variante observada']:[]),...(trend.perDay!==null&&trend.perDay>0?['Crescimento observado no histórico']:[])],warnings,category:facts.category?celularLabels[facts.category]:'',brand,priceBand:o.price<100?'Até R$ 100':o.price<300?'R$ 100–300':o.price<1000?'R$ 300–1.000':o.price<2000?'R$ 1.000–2.000':o.price<4000?'R$ 2.000–4.000':'Acima de R$ 4.000',confidence,components,weights,trend,discountSource:observed!==null?'observed':o.reportedDiscount!==null?'reported':'none',observedDiscount:observed,fingerprint:facts.fingerprint,version:3,mobile:{...facts,sellerReputation:null,ratingCount}};
}
type Row={id:string;data:ShopeeOffer;assessment:OfferAssessment};
export function compareCelularPrices<T extends Row>(rows:T[]){
 for(const row of rows){const m=row.assessment.mobile;if(!m?.variantKey||m.category!=='smartphones'||row.data.price!==row.data.priceMax)continue;
  const others=rows.filter(r=>r!==row&&r.assessment.mobile?.variantKey===m.variantKey&&r.data.shopId!==row.data.shopId&&r.data.price===r.data.priceMax&&r.assessment.recommended&&Math.abs(Date.parse(r.data.checkedAt)-Date.parse(row.data.checkedAt))<=86400000),unique=[...new Map(others.map(r=>[r.data.shopId,r])).values()];if(unique.length<2)continue;
  const prices=unique.map(r=>r.data.price).sort((a,b)=>a-b),median=prices.length%2?prices[Math.floor(prices.length/2)]:(prices[prices.length/2-1]+prices[prices.length/2])/2,differencePercent=Math.round((row.data.price-median)/median*1000)/10;
  m.comparison={equivalents:unique.length,median,differencePercent};
  if(differencePercent<-60){row.assessment.recommended=row.assessment.eligible=false;row.assessment.reasons.push('Preço muito abaixo de anúncios equivalentes; requer revisão');}
  else if(differencePercent<=-5){row.assessment.score=Math.min(100,row.assessment.score+5);row.assessment.recommendationReasons.push('Preço menor que '+unique.length+' anúncios equivalentes no cache');}
 }
 return rows;
}
export function diversifyCelulares<T extends Row>(rows:T[],policy:CelularesConfig,excluded:Set<string>){
 const pool=rows.filter(r=>r.assessment.recommended&&!excluded.has(r.assessment.fingerprint)),selected:T[]=[],seen=new Set<string>(),counts=new Map<string,number>(),total=Object.values(policy.weights).reduce((n,v)=>n+v,0);
 while(pool.length&&selected.length<policy.selectionSize){
  const utility=(r:T)=>{const category=r.assessment.mobile!.category!,target=policy.selectionSize*policy.weights[category]/total,used=counts.get(category)||0;return r.assessment.score+Math.min(18,(target-used)*4)-5*(counts.get('brand:'+r.assessment.brand)||0)-4*(counts.get('price:'+r.assessment.priceBand)||0)-3*(counts.get('shop:'+r.data.shopId)||0);};
  pool.sort((a,b)=>utility(b)-utility(a)||b.assessment.confidence-a.assessment.confidence||a.id.localeCompare(b.id));const row=pool.shift()!,category=row.assessment.mobile!.category!;
  const cap=Math.max(2,Math.ceil(policy.selectionSize*(policy.weights[category]/total+.15)));
  if(seen.has(row.assessment.fingerprint)||(counts.get(category)||0)>=cap)continue;
  seen.add(row.assessment.fingerprint);selected.push(row);for(const key of [category,'brand:'+row.assessment.brand,'price:'+row.assessment.priceBand,'shop:'+row.data.shopId])counts.set(key,(counts.get(key)||0)+1);
 }
 return selected;
}
