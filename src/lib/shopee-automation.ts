import {z} from 'zod';
import {assessOffer} from './shopee-quality';
export {salesTrend,diversifyOffers,offerFingerprint} from './shopee-quality';
export type {OfferAssessment,OfferObservation} from './shopee-quality';

export const gamerKeywords=['gamer','controle ps5','controle xbox pc','headset gamer','mouse gamer','teclado mecanico gamer','ssd nvme','acessorios nintendo switch','monitor gamer','jogo ps5','controle pc bluetooth','smartwatch','fone bluetooth','webcam','microfone usb','ssd ps5'];
const words=z.array(z.string().trim().min(2).max(80)).min(1).max(50);
export const shopeeConfigSchema=z.object({
 enabled:z.boolean().default(false),dryRun:z.boolean().default(true),requireReview:z.boolean().default(true),
 dailyLimit:z.number().int().min(6).max(100).default(8),batchSize:z.number().int().min(1).max(50).default(50),
 times:z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12).default(['09:00','12:30','16:30','20:30']).refine(v=>new Set(v).size===v.length,'Horários repetidos'),
 keywords:words.default(gamerKeywords),avoid:z.array(z.string().trim().min(2).max(80)).max(50).default(['replica','falsificado','somente caixa','apenas caixa','conta compartilhada','conta primaria','conta secundaria','random key','miniatura']),
 minRating:z.number().min(0).max(5).default(4.6),minSales:z.number().int().min(0).max(1000000).default(1000),
 minDiscount:z.number().min(0).max(100).default(15),minConfidence:z.number().min(0).max(100).default(70),
 salesScale:z.number().int().min(1000).max(10000000).default(100000),commissionScale:z.number().min(0.01).max(1).default(0.2),
 searchMode:z.enum(['mixed','popular','keywords','categories']).default('mixed'),
 sortType:z.union([z.literal(1),z.literal(2)]).default(2),listType:z.union([z.literal(0),z.literal(2)]).default(2),
 categoryIds:z.array(z.number().int().positive().max(2147483647)).max(12).default([]),
 minPrice:z.number().min(0).max(1000000).default(20),maxPrice:z.number().positive().max(1000000).default(8000),
 minScore:z.number().min(0).max(100).default(55),cacheHours:z.number().int().min(1).max(48).default(24),
 stalePolicy:z.enum(['skip','omit']).default('skip'),scanAt:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('08:00'),
}).superRefine((v,c)=>{if(v.maxPrice<v.minPrice)c.addIssue({code:'custom',path:['maxPrice'],message:'Preço máximo menor que o mínimo'});if(v.dailyLimit<=v.times.length)c.addIssue({code:'custom',path:['dailyLimit'],message:'Reserve ao menos uma consulta para a busca além das revalidações'});if(v.searchMode==='categories'&&!v.categoryIds.length)c.addIssue({code:'custom',path:['categoryIds'],message:'Cadastre uma categoria para usar somente esta fonte'});});
export type ShopeeConfig=z.infer<typeof shopeeConfigSchema>;
export const defaultShopeeConfig=()=>shopeeConfigSchema.parse({});
export type ShopeeOffer={itemId:string;shopId:string;name:string;image:string;offerLink:string;productLink:string;price:number;priceMax:number;rating:number|null;sales:number|null;commission:number|null;reportedDiscount:number|null;checkedAt:string;previousPrice?:number|null;previousAt?:string|null};
export function normalized(text:string){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export const assessShopeeOffer=assessOffer;
export function bahiaDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function bahiaTime(now=new Date()){return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);}
export function dailyKeywords(c:ShopeeConfig,day:string){const offset=Math.floor(Date.parse(day+'T00:00:00Z')/86400000)%c.keywords.length;return Array.from({length:Math.min(c.keywords.length,c.dailyLimit-c.times.length,6)},(_,i)=>c.keywords[(offset+i)%c.keywords.length]);}
export function futureSlots(c:ShopeeConfig,now=new Date()){const day=bahiaDay(now);return [...c.times].sort().map(t=>new Date(day+'T'+t+':00-03:00')).filter(d=>d.getTime()>now.getTime());}
export function priceCurrent(o:ShopeeOffer,now=Date.now()){const t=Date.parse(o.checkedAt);return Number.isFinite(t)&&t<=now+1000&&now-t<=15*60000;}
const brl=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
export function shopeeCaption(o:ShopeeOffer,now=Date.now()){
 const name=o.name.replace(/[\r\n*_~<>\[\]]/g,' ').slice(0,140),current=priceCurrent(o,now);
 // Shopee's reported percentage is NOT evidence of an old price. Never derive one.
 const previous=o.previousPrice&&o.previousAt&&Date.parse(o.previousAt)<Date.parse(o.checkedAt)&&Date.parse(o.checkedAt)-Date.parse(o.previousAt)<=30*86400000&&o.priceMax===o.price&&o.previousPrice>o.price?o.previousPrice:null;
 const discount=current&&previous?`🔥 ${Math.floor((Math.round(previous*100)-Math.round(o.price*100))*100/Math.round(previous*100))}% abaixo do preço observado em ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia'}).format(new Date(o.previousAt!))}`:'';
 return ['🎮 ACHADO GAMER! #publi','🎯 '+name,current?`💰 ${o.priceMax>o.price?'A partir de':'Por'} ${brl(o.price)}`:'Confira preço e disponibilidade na loja.',discount,'🛒 Aproveite:\n'+o.offerLink,'🔗 Link de afiliado'].filter(Boolean).join('\n\n');
}
export function liveShopeeAllowed(c:ShopeeConfig,env:Record<string,string|undefined>){return c.enabled&&!c.dryRun&&env.SHOPEE_AUTOMATION_LIVE==='true';}
