import {z} from 'zod';
export const celularCategories=['smartphones','audio','watches','accessories','gadgets'] as const;
export type CelularCategory=typeof celularCategories[number];
export const celularLabels:Record<CelularCategory,string>={smartphones:'Smartphones',audio:'Fones e áudio',watches:'Smartwatches',accessories:'Acessórios',gadgets:'Gadgets'};
const share=z.number().int().min(0).max(100);
export const celularesConfigSchema=z.object({
 weights:z.object({smartphones:share.default(35),audio:share.default(20),watches:share.default(15),accessories:share.default(20),gadgets:share.default(10)}).default({smartphones:35,audio:20,watches:15,accessories:20,gadgets:10}),
 requestsPerSearch:z.number().int().min(1).max(5).default(5),cacheMinutes:z.number().int().min(1).max(60).default(15),selectionSize:z.number().int().min(10).max(48).default(24),
 minRating:z.number().min(0).max(5).default(4.6),minPhoneSales:z.number().int().min(1).max(1000000).default(20),minOtherSales:z.number().int().min(1).max(1000000).default(100),
 oldProtectionModels:z.array(z.string().trim().min(3).max(50)).max(30).default(['iphone 4','iphone 4s','iphone 5','iphone 5s','iphone 6','iphone 6s','galaxy s4','galaxy s5']),
}).strict().refine(v=>Object.values(v.weights).some(n=>n>0),'Informe ao menos uma categoria com participação maior que zero.');
export type CelularesConfig=z.infer<typeof celularesConfigSchema>;
export const defaultCelularesConfig=()=>celularesConfigSchema.parse({});
export const celularSortSchema=z.enum(['relevance','sales','rating','price','discount']);
export type CelularSort=z.infer<typeof celularSortSchema>;
export const cellularNorm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const phoneModel=/\b(iphone\s*\d{1,2}(?:\s*(?:pro\s*max|pro|plus|mini))?|iphone\s*se(?:\s*\d)?|(?:samsung\s+)?galaxy\s*[aszmf]\s*\d{1,3}(?:\s*(?:ultra|plus|fe))?|moto\s*g\s*\d{1,3}(?:\s*(?:power|play|plus))?|(?:motorola\s+)?edge\s*\d{1,3}(?:\s*(?:pro|fusion|neo|ultra))?|redmi\s*(?:note\s*)?\d{1,2}[a-z]?(?:\s*(?:pro\s*plus|pro|plus))?|poco\s*[xfcm]\s*\d{1,2}(?:\s*pro)?|(?:realme|oppo|infinix|tecno|honor|vivo|asus|nokia)\s+(?:(?:note|spark|zero|hot|rog|zenfone)\s*)?[a-z]?\d{1,3}[a-z]*(?:\s*pro)?)\b/i;
const knownBrands=/\b(apple|iphone|samsung|galaxy|motorola|moto|xiaomi|redmi|poco|realme|oppo|infinix|tecno|honor|vivo|asus|nokia|jbl|qcy|edifier|soundcore|anker|baseus|ugreen|amazfit|huawei|haylou|lenovo|sony|philips)\b/;
export type CelularFacts={category:CelularCategory|null;model:string|null;storageGB:number|null;ramGB:number|null;condition:'novo'|'seminovo'|'usado'|'recondicionado'|null;warranty:string|null;variantKey:string|null;fingerprint:string;blocks:string[]};
export function celularFacts(name:string,config:CelularesConfig=defaultCelularesConfig()):CelularFacts{
 const title=cellularNorm(name),blocks:string[]=[];
 const accessory=/\b(capa|capinha|case|pelicula|pulseira|carregador|cabo|suporte|adaptador|hub|power\s?bank|fone de ouvido para capacete)\b/.test(title);
 const gadget=/\b(airtag|smarttag|rastreador bluetooth|mini impressora termica|impressora termica portatil)\b/.test(title)||/\b(microfone|tripe|estabilizador|gimbal)\b/.test(title)&&/\b(celular|smartphone|iphone|android)\b/.test(title);
 const watch=/\b(smartwatch|smart watch|smartband|smart band|apple watch|galaxy watch|amazfit|relogio inteligente|relogio esportivo inteligente)\b/.test(title);
 const audio=/\b(fone|headphone|headset|earbuds|airpods|tws)\b|caixa de som.*bluetooth/.test(title);
 const model=title.match(phoneModel)?.[1]?.replace(/^(?:samsung|motorola)\s+/,'').replace(/\s+/g,' ').trim()||(/\bsmartphone\b/.test(title)?title.match(/smartphone\s+([a-z]+\s+(?:[a-z]+\s+)?[a-z]+\s*\d+[a-z]*(?:\s*(?:pro|plus))?)\b/)?.[1]||null:null);
 const device=!!model||/\b(smartphone|celular|telefone android)\b/.test(title);
 const identifiedAccessory=/\b(usb[- ]?c|tipo c|lightning|power\s?bank|inducao|magsafe)\b/.test(title)||!!model||/\b(apple watch|galaxy watch|smartphone|celular|airpods)\b/.test(title);
 const category:CelularCategory|null=accessory?(identifiedAccessory?'accessories':null):gadget?'gadgets':watch?'watches':audio?'audio':device?'smartphones':null;
 if(!category)blocks.push('Sem identificação clara de um produto de Celulares & Gadgets');
 if(/\b(replica|falsificad[oa]|primeira linha|primeira qualidade|1\s*:\s*1|apenas caixa|somente caixa|caixa vazia|defeito|defeituoso|nao liga|retirada de pecas|para pecas|tela quebrada|bloqueado|imitacao)\b/.test(title))blocks.push('Anúncio de réplica, aparelho com defeito ou item incompleto');
 if(/\b(tenis|sapato|roupa|boneca|brinquedo|panela|cozinha|furadeira|filtro de oleo|peca automotiva|capacete)\b/.test(title)||/\b(papel|bobina|refil)\b/.test(title)&&/impressora/.test(title))blocks.push('Produto de outra categoria');
 if(category==='smartphones'&&!model)blocks.push('Modelo do smartphone não identificado');
 if(/\b(capa|capinha|case|pelicula)\b/.test(title)&&(!model||/universal|aleatori|sortid/.test(title)))blocks.push('Proteção sem modelo de aparelho definido');
 if(/\bpelicula\b/.test(title)&&config.oldProtectionModels.some(m=>(' '+title+' ').includes(' '+cellularNorm(m)+' ')))blocks.push('Película de modelo antigo excluído nos filtros');
 const condition=/\b(recondicionado|refurbished|renovado)\b/.test(title)?'recondicionado':/\b(seminovo|semi novo|semi-novo)\b/.test(title)?'seminovo':/\b(usado|usada)\b/.test(title)?'usado':/\b(novo|nova|lacrado|lacrada)\b/.test(title)?'novo':null;
 if(category==='smartphones'&&/\biphone\b/.test(title)&&!condition)blocks.push('Condição do iPhone não informada no anúncio');
 const numbers=[...title.matchAll(/\b(\d{1,4})\s*(gb|tb)\b/g)],ramMatch=title.match(/\b(?:ram\s*:?\s*(\d{1,2})\s*gb|(\d{1,2})\s*gb\s*(?:de\s*)?ram)\b/),ramGB=ramMatch?Number(ramMatch[1]||ramMatch[2]):null;
 const storage=numbers.filter(m=>m[2]==='tb'||Number(m[1])>=32).map(m=>Number(m[1])*(m[2]==='tb'?1024:1)),storageGB=storage.length===1?storage[0]:null;
 const ambiguous=storage.length>1||/\b(?:cores|modelos|versoes|variantes)\s*(?:sortid|variad|aleator)/.test(title);
 if(ambiguous)blocks.push('Variantes distintas no título; confirme a versão e o preço');
 const network=title.match(/\b[45]g\b/)?.[0]||'nao informado',color=title.match(/\b(?:cor\s*:\s*)([a-z ]{2,25})/)?.[1]?.trim()||'nao informada';
 const fingerprint=category==='smartphones'&&model?[category,model,storageGB??'capacidade desconhecida',ramGB??'ram desconhecida',condition??'condicao desconhecida',network,color].join(':'):title.replace(/[^a-z0-9]+/g,' ').trim();
 // Different sellers are comparable only with explicitly equal model, capacity,
 // condition and network. Unknown fields do not stand for a verified variant.
 const variantKey=category==='smartphones'?model&&storageGB&&ramGB&&condition&&network!=='nao informado'&&!ambiguous?[model,storageGB,ramGB??'na',condition,network,color].join(':'):null:category&&!ambiguous?fingerprint:null;
 return {category,model,storageGB,ramGB,condition,warranty:title.match(/\bgarantia\s*(?:de\s*)?\d{1,2}\s*(?:meses|mes|anos|ano|dias)\b/)?.[0]||null,variantKey,fingerprint,blocks};
}
export function celularBrand(name:string){return cellularNorm(name).match(knownBrands)?.[1]||'Não identificada';}
export const celularQueries:Record<CelularCategory,string[]>={
 smartphones:['smartphone samsung galaxy a','iphone seminovo','motorola moto g smartphone','xiaomi redmi note smartphone','poco x smartphone','samsung galaxy s smartphone','iphone novo','motorola edge smartphone','poco f smartphone','smartphone realme'],
 audio:['fone bluetooth qcy','fone bluetooth jbl','fone edifier bluetooth','fone soundcore','airpods apple','headphone cancelamento ruido'],
 watches:['smartwatch amazfit','samsung galaxy watch','xiaomi smart band','apple watch','relogio inteligente esportivo'],
 accessories:['carregador rapido usb c','power bank baseus','cabo lightning','carregador inducao','suporte celular','capa iphone 15','carregador veicular usb c','adaptador usb c smartphone'],
 gadgets:['rastreador bluetooth','mini impressora termica bluetooth','microfone sem fio celular','estabilizador celular','tripe smartphone'],
};
/** Smooth weighted rotation; cursor is reserved by the database under the search lease. */
export function celularSearchTerms(cursor:number,policy:CelularesConfig,custom:string[]=[]){
 custom=[...new Set(custom.map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=80))].slice(0,50);
 if(custom.length)return Array.from({length:Math.min(policy.requestsPerSearch,custom.length)},(_,i)=>custom[(cursor+i)%custom.length]);
 const wheel:CelularCategory[]=[],counts=Object.fromEntries(celularCategories.map(k=>[k,0])) as Record<CelularCategory,number>,total=Object.values(policy.weights).reduce((a,b)=>a+b,0);
 for(let i=0;i<100;i++){const next=celularCategories.filter(k=>policy.weights[k]>0).sort((a,b)=>policy.weights[b]*(i+1)/total-counts[b]-(policy.weights[a]*(i+1)/total-counts[a]))[0];counts[next]++;wheel.push(next);}
 return Array.from({length:policy.requestsPerSearch},(_,i)=>{const index=cursor+i,category=wheel[index%wheel.length],before=wheel.slice(0,index%wheel.length).filter(k=>k===category).length+Math.floor(index/wheel.length)*counts[category];return celularQueries[category][before%celularQueries[category].length];});
}
