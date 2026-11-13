import type {ShopeeOffer,ShopeeConfig} from './shopee-automation';

const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clamp=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const niches:[string,RegExp,boolean][]=[
 ['Controles',/\b(controle|controller|dualshock|dualsense|gamepad|joystick)\b/,true],
 ['Headsets e áudio',/\b(headset|headphone|fone|earbuds)\b/,false],
 ['Mouses',/\b(mouse|mousepad)\b/,false],['Teclados',/\b(teclado|keyboard)\b/,false],
 ['Armazenamento',/\b(ssd|nvme|memoria ram|ram ddr[345]|memoria\s+(?:\w+\s+){0,4}ddr[345])\b/,false],['Monitores',/\b(monitor)\b/,true],
 ['Componentes de PC',/\b(processador|placa de video|placa mae|ryzen|intel core|geforce|radeon|intel arc|rtx\s?\d{4}|gtx\s?\d{3,4}|rx\s?\d{3,4})\b/,true],
 ['Acessórios gamer',/\b(grip|suporte|cabo|adaptador|gabinete|cooler|fonte|ventoinha|cadeira|mesa|volante|pedal|captura|dock)\b/,true],
 ['Consoles e jogos',/\b(ps5|ps4|playstation|xbox|nintendo|videogame|video game|steam deck)\b/,false],
 ['Smartwatches',/\b(smartwatch|smart watch|smartband|relogio inteligente)\b/,false],
 ['Tecnologia',/\b(webcam|hub usb|carregador|powerbank|power bank|roteador|tablet|notebook|microfone|smartphone|celular|iphone)\b/,false],
];
const brands=['logitech','redragon','razer','corsair','hyperx','kingston','sandisk','samsung','xiaomi','amazfit','huawei','anker','ugreen','baseus','sony','microsoft','nintendo','8bitdo','gamesir','aoc','lg','asus','acer','dell','lenovo','intel','amd','fifine','attack shark','havit','knup','jbl','qcy','edifier'];
export type OfferObservation={shop_id:string;item_id:string;observed_at:string;sales:number|null;price:number;price_max:number;rating?:number|null};
export type SalesTrend={state:'insufficient'|'growing'|'stable'|'accelerating'|'counter_reset';delta:number|null;perDay:number|null;days:number|null;samples:number};
export type OfferAssessment={relevant:boolean;recommended:boolean;eligible:boolean;score:number;reasons:string[];recommendationReasons:string[];warnings:string[];category:string;brand:string;priceBand:string;confidence:number;components:{sales:number|null;rating:number|null;relevance:number;price:number|null;trend:number|null};weights:{sales:number;rating:number;relevance:number;price:number;trend:number};trend:SalesTrend;discountSource:'observed'|'reported'|'none';observedDiscount:number|null;fingerprint:string;version:3};
const unrelatedEquipment=/\b(imobiliza\w*|imobiliz\w*|ortoped\w*|hospital\w*|medic[oa]s?|cirurg\w*|cervical|tala|talas|muleta\w*|joelheira\w*|tornozeleira\w*|eletroestimul\w*|fisioterap\w*|obd\w*|automotiv\w*|transponder|chaveiro|airsoft)\b/;
const otherNiches=/\b(creatina|whey|albumina|colageno|suplementos?|pre treino|shampoos?|condicionador(?:es)?|capilar|cosmeticos?|sabonete|perfume|maquiagem|hidratante|skincare|barbeador|chapinha|secador|cabelo|batedor(?:es)?|batedeira|liquidificador|mixer|panela|cafeteira|forno|triturador|alimentos?|legumes|cozinha|vestido|camiseta|moletom|roupa|tenis|sapato|chinelo|brinquedo|racao|pet|bebe|pressao arterial|glicemia|termometro|furadeira|parafusadeira|chave de fenda)\b/;
export function classifyGamingTech(name:string){
 const title=norm(name),niche=[...niches].filter(([,re])=>re.test(title)).sort((a,b)=>title.search(a[1])-title.search(b[1]))[0];
 const context=/\b(gamer|gaming|ps[45]|playstation|xbox|nintendo|pc|computador|notebook|gamepad|dualsense|dualshock|joystick|intel|amd|ryzen|geforce|radeon|rtx|gtx|atx|am[45]|lga\d+|ddr[345])\b/.test(title);
 const category=niche&&(!niche[2]||context)&&!otherNiches.test(title)&&!unrelatedEquipment.test(title)?niche[0]:'';
 // A generic charger can be an appliance part. Require an electronic device or
 // interface, rather than accepting the word alone as a technology product.
 const genericCharger=!!category&&/\bcarregador\b/.test(title)&&!context&&!/\b(usb|usb c|tipo c|celular|smartphone|iphone|samsung|powerbank|tablet|smartwatch)\b/.test(title);
 const genericAccessory=!!category&&/\b(kit|suporte|cabo|adaptador|dock|grip)\b/.test(title)&&!context&&!/\b(usb|hdmi|displayport|nvme|ssd|teclado|mouse|headset|fone|smartphone|celular|iphone|smartwatch)\b/.test(title);
 return {relevant:!!category&&!genericCharger&&!genericAccessory,category:genericCharger||genericAccessory?'':category};
}
export function offerFingerprint(name:string){
 const title=norm(name),brand=brands.find(b=>new RegExp('\\b'+b+'\\b').test(title)),category=classifyGamingTech(name).category;
 const model=title.match(/\b(?:g\s?\d{3,4}(?:\s?(?:x|hero|lightspeed|plus))?|ryzen\s+[3579]\s+\d{4}[a-z]{0,3}|(?:rtx|gtx|rx)\s?\d{3,4}(?:\s?(?:ti|super|xt|xtx))?|i[3579][- ]\d{4,5}[a-z]{0,3}|sn\d{3,4}[a-z]?|nv[23]|a400|kc\d{3,4}|980\s?pro|990\s?pro)\b/)?.[0];
 if(brand&&model){const specs=[...title.matchAll(/\b\d+(?:[.,]\d+)?\s?(?:gb|tb|hz|mhz)\b/g)].map(m=>m[0].replace(/\s/g,'')).sort();return [category,brand,model.replace(/\s+/g,''),...specs].join(':');}
 return title.replace(/\b(preto|preta|branco|branca|azul|rosa|vermelho|vermelha|rgb|com fio|sem fio|oficial|produto|novo|nova)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function salesTrend(o:ShopeeOffer,history:OfferObservation[]):SalesTrend{
 const now=Date.parse(o.checkedAt),prior=[...new Map(history.filter(h=>h.shop_id===o.shopId&&h.item_id===o.itemId&&h.sales!==null&&Date.parse(h.observed_at)<=now&&now-Date.parse(h.observed_at)<=30*86400000).map(h=>[h.observed_at,h])).values()].sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
 const points=prior.filter(h=>Date.parse(h.observed_at)<now);if(o.sales!==null)points.push({shop_id:o.shopId,item_id:o.itemId,observed_at:o.checkedAt,sales:o.sales,price:o.price,price_max:o.priceMax});
 const base:SalesTrend={state:'insufficient',delta:null,perDay:null,days:null,samples:points.length};if(o.sales===null||points.length<2)return base;
 // A counter may be rolling or reset. Neither a reset nor a same-minute reread
 // proves demand. Require observations separated by at least one day.
 if(points.some((p,i)=>i>0&&p.sales!<points[i-1].sales!))return {...base,state:'counter_reset'};
 const first=[...points].reverse().find(p=>now-Date.parse(p.observed_at)>=86400000);if(!first)return base;
 const days=(now-Date.parse(first.observed_at))/86400000,delta=o.sales-first.sales!,perDay=delta/days;
 let state:SalesTrend['state']=delta>0?'growing':'stable';
 const older=[...points].reverse().find(p=>Date.parse(first.observed_at)-Date.parse(p.observed_at)>=86400000);
 if(older){const oldRate=(first.sales!-older.sales!)/((Date.parse(first.observed_at)-Date.parse(older.observed_at))/86400000);if(delta>=10&&perDay>oldRate*1.2)state='accelerating';}
 return {state,delta,perDay:Math.round(perDay*10)/10,days:Math.round(days*10)/10,samples:points.length};
}
function safeUrl(raw:string,domains:string[]){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));}catch{return false;}}
export function assessOffer(o:ShopeeOffer,c:ShopeeConfig,history:OfferObservation[]=[]):OfferAssessment{
 const title=norm(o.name),{category,relevant}=classifyGamingTech(o.name);
 const reasons:string[]=[],warnings:string[]=[];
 if(!relevant)reasons.push('Sem relação clara com Tech & Games');
 if(c.avoid.some(w=>title.includes(norm(w)))||/\b(gratis|frete|cupom|pix|estoque|desconto|imperdivel|original garantido|reais|replica|falsificado|somente caixa|apenas caixa)\b|por\s+\d|https?:|www\.|R\$|[%<>\n\r]/i.test(title))reasons.push('Título suspeito ou alegações não verificadas');
 const sales=o.sales!==null&&Number.isSafeInteger(o.sales)&&o.sales>=0?o.sales:null,rating=o.rating!==null&&o.rating>=0&&o.rating<=5?o.rating:null;
 const commission=o.commission!==null&&o.commission>=0&&o.commission<=1?o.commission:null;
 const reported=o.reportedDiscount!==null&&o.reportedDiscount>=0&&o.reportedDiscount<=100?o.reportedDiscount:null;
 const validPrice=Number.isFinite(o.price)&&Number.isFinite(o.priceMax)&&o.price>0&&o.priceMax>=o.price;
 if(rating===null||rating<c.minRating)reasons.push('Avaliação insuficiente ou ausente');
 if(sales===null||sales<c.minSales)reasons.push('Histórico de vendas insuficiente ou ausente');
 if(!validPrice||o.price<c.minPrice||o.price>c.maxPrice)reasons.push('Preço inválido ou fora da faixa');
 if(!o.name.trim()||!safeUrl(o.image,['shopee.com.br','shopee.com','susercontent.com','shopeemobile.com'])||!safeUrl(o.offerLink,['shopee.com.br','shope.ee']))reasons.push('Nome, foto ou link de afiliado inválido');
 if(o.priceMax>o.price)reasons.push(o.priceMax/o.price>=2?'Variações com preço potencialmente artificial; confirmar produto e preço':'Preço da variante apresentada não confirmado pela API');
 const past=history.filter(h=>h.shop_id===o.shopId&&h.item_id===o.itemId&&h.price===h.price_max&&o.price===o.priceMax&&Date.parse(h.observed_at)<Date.parse(o.checkedAt)&&Date.parse(o.checkedAt)-Date.parse(h.observed_at)<=30*86400000).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];
 const previous=past?{price:past.price,at:past.observed_at}:o.previousPrice&&o.previousAt?{price:o.previousPrice,at:o.previousAt}:null;
 const observed=previous&&o.price===o.priceMax&&previous.price>o.price&&Date.parse(previous.at)<Date.parse(o.checkedAt)&&Date.parse(o.checkedAt)-Date.parse(previous.at)<=30*86400000?100*(previous.price-o.price)/previous.price:null;
 const discount=observed??reported,discountSource=observed!==null?'observed':reported!==null?'reported':'none';
 if(discount!==null&&discount<c.minDiscount)reasons.push('Desconto abaixo do mínimo configurado');
 if(reported!==null)warnings.push('Desconto informado pela API; não comprova preço anterior');
 if(discount===null)warnings.push('Desconto desconhecido; peso redistribuído, sem presumir vantagem de preço');
 if(commission===null)warnings.push('Comissão não informada');
 const increased=!!past&&o.price>past.price;if(increased)warnings.push('Preço acima da última observação comparável; sem pontos por desconto informado');
 const trend=salesTrend(o,history);if(trend.state==='insufficient')warnings.push('Sem histórico suficiente para tendência recente');if(trend.state==='counter_reset')warnings.push('Contagem de vendas diminuiu; crescimento não calculado');
 const brand=brands.find(b=>new RegExp('\\b'+b+'\\b').test(title))||'Não identificada';
 const ratingCount=Number.isSafeInteger(o.ratingCount)&&o.ratingCount!>=0?o.ratingCount!:null;
 const nicheFit=relevant?(category==='Tecnologia'||category==='Smartwatches'?0.85:category==='Acessórios gamer'?0.8:1):0;
 const metrics={sales:sales===null?null:clamp(Math.log10(sales+1)/Math.log10(c.salesScale+1)),rating:rating===null?null:clamp((rating-3)/2)*(ratingCount===null?1:0.7+0.3*clamp(Math.log10(ratingCount+1)/3)),relevance:nicheFit,price:discount===null?null:increased?0:clamp(discount/60)*(discountSource==='reported'?0.6:1),trend:trend.perDay===null?null:clamp(Math.log10(trend.perDay+1)/3)};
 const baseWeights={sales:30,rating:25,relevance:25,price:10,trend:10};
 const available=Object.entries(metrics).reduce((sum,[key,value])=>sum+(value===null?0:baseWeights[key as keyof typeof baseWeights]),0);
 const weights=Object.fromEntries(Object.entries(metrics).map(([key,value])=>[key,value===null?0:baseWeights[key as keyof typeof baseWeights]*100/available])) as OfferAssessment['weights'];
 const components=Object.fromEntries(Object.entries(metrics).map(([key,value])=>[key,value===null?null:Math.round(value*weights[key as keyof typeof weights]*10)/10])) as OfferAssessment['components'];
 const score=Math.round(Object.entries(metrics).reduce((sum,[key,value])=>sum+(value??0)*weights[key as keyof typeof weights],0));
 // The estimate and the evidence coverage are separate. A title alone can score
 // highly after redistribution but must never qualify as a confident recommendation.
 const confidence=Math.round((validPrice?10:0)+(o.name&&o.image&&o.offerLink?10:0)+(sales!==null?25:0)+(rating!==null?25:0)+(ratingCount!==null?5:0)+(discountSource==='observed'?15:discountSource==='reported'?8:0)+(trend.perDay!==null?10:0));
 if(confidence<c.minConfidence)reasons.push('Dados insuficientes para a confiança mínima');
 if(score<c.minScore)reasons.push('Pontuação abaixo do mínimo');
 const modelIdentified=/\b(?:[a-z]{1,8}[- ]?\d{2,5}[a-z]{0,4}|\d+(?:gb|tb|hz)|ddr[345]|ryzen\s+[3579]|core\s+i[3579])\b/.test(title);
 const established=(sales!==null&&sales>=Math.min(c.minSales,1000)&&rating!==null&&rating>=Math.min(c.minRating,4.6))||(sales!==null&&sales>=20&&rating!==null&&rating>=4.6);
 const exploration=modelIdentified&&brand!=='Não identificada'&&(sales!==null||rating!==null)&&(rating===null||rating>=4.6);
 const structuralBlock=reasons.some(r=>/suspeito|inválido|fora da faixa|Sem relação/.test(r));
 const recommended=relevant&&!structuralBlock&&(established||exploration)&&score>=(established?c.minScore:Math.min(c.minScore,40))&&confidence>=40;
 const recommendationReasons:string[]=[];
 if(sales!==null&&sales>=1000)recommendationReasons.push('Muitas vendas');
 if(rating!==null&&rating>=4.6)recommendationReasons.push('Bem avaliado');
 if(ratingCount!==null&&ratingCount>=100)recommendationReasons.push('Muitas avaliações');
 if(observed!==null&&observed>=15&&!increased)recommendationReasons.push('Queda de preço observada');
 if(trend.state==='growing'||trend.state==='accelerating')recommendationReasons.push('Vendas em crescimento no histórico local');
 if(brand!=='Não identificada')recommendationReasons.push('Marca reconhecida no nicho');
 if(!established&&exploration)warnings.push('Candidato para descoberta; poucos dados, sem comprovação de lançamento ou alta recente');
 if(ratingCount===null)warnings.push('Quantidade de avaliações não disponibilizada pelo contrato atual');
 return {relevant,recommended,eligible:!reasons.length,score,reasons,recommendationReasons,warnings,category,brand,priceBand:o.price<100?'Até R$ 100':o.price<300?'R$ 100–300':o.price<1000?'R$ 300–1.000':'Acima de R$ 1.000',confidence,components,weights,trend,discountSource,observedDiscount:observed===null?null:Math.round(observed*10)/10,fingerprint:offerFingerprint(o.name),version:3};
}
export function diversifyOffers<T extends {id:string;data:ShopeeOffer;assessment:OfferAssessment}>(rows:T[],limit:number,excluded=new Set<string>(),manual=false){
 const pool=rows.filter(r=>(manual?r.assessment.recommended:r.assessment.eligible)&&!excluded.has(r.assessment.fingerprint)).sort((a,b)=>b.assessment.score-a.assessment.score||b.assessment.confidence-a.assessment.confidence||a.id.localeCompare(b.id)),selected:T[]=[],seen=new Set<string>(),counts=new Map<string,number>();
 while(pool.length&&selected.length<limit){
  const utility=(r:T)=>r.assessment.score-12*(counts.get('c:'+r.assessment.category)||0)-6*(r.assessment.brand==='Não identificada'?0:counts.get('b:'+r.assessment.brand)||0)-4*(counts.get('p:'+r.assessment.priceBand)||0)-4*(counts.get('s:'+r.data.shopId)||0);
  pool.sort((a,b)=>utility(b)-utility(a)||b.assessment.score-a.assessment.score||a.id.localeCompare(b.id));const row=pool.shift()!;
  if(seen.has(row.assessment.fingerprint)||(counts.get('c:'+row.assessment.category)||0)>=3||(row.assessment.brand!=='Não identificada'&&(counts.get('cb:'+row.assessment.category+':'+row.assessment.brand)||0)>=2))continue;seen.add(row.assessment.fingerprint);selected.push(row);
  const cb='cb:'+row.assessment.category+':'+row.assessment.brand;counts.set(cb,(counts.get(cb)||0)+1);
  for(const key of ['c:'+row.assessment.category,'b:'+row.assessment.brand,'p:'+row.assessment.priceBand,'s:'+row.data.shopId])counts.set(key,(counts.get(key)||0)+1);
 }
 return selected;
}
