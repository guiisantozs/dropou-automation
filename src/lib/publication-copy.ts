import {operationCopy} from './workspace-brands';
import {affiliateStore} from './affiliate';
import {captionError} from './caption-editor';
import {freshPrice,Product} from './domain';
export type PublicationMode='verified'|'safe';
export type PublicationPreference='auto'|'safe';
export function publicationIdentityError(p:Product){
 if(p.demo)return 'Dados demonstrativos não podem ser publicados de verdade.';
 try{if(affiliateStore(p.affiliateUrl)!==p.store||/[\s<>]/.test(p.affiliateUrl)||!/^https:\/\/([a-zA-Z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com|shopee\.com\.br|shope\.ee)(?::443)?([/?#]|$)/i.test(p.affiliateUrl))return 'Adicione um link oficial de afiliado do Mercado Livre ou Shopee.';}catch{return 'Adicione um link oficial de afiliado do Mercado Livre ou Shopee.';}
 if(!p.name.trim())return 'Salve o nome do produto antes de publicar.';
 return null;
}
export function confirmedConditions(p:Product,now=Date.now()){
 return freshPrice(p,now)&&p.inStock===true&&(p.paymentMethod!=='pix'||p.pixVerified)&&(p.dataOrigin!=='screenshot'||p.screenshotConfirmed===true);
}
// A fixed local template deliberately excludes creative copy, commercial facts and historical prices.
// Keep this deterministic renderer aligned with dropou_safe_publication_caption in the reviewed SQL.
export function safePublicationCaption(p:Product){
 const suspect=/https?:\/\/|www\.|R\$|[$€%]|pix|frete|cupom|desconto|economiz|estoque|dispon[ií]vel|gr[aá]tis|promo[cç]|parcel|sem juros|menor pre[cç]o|garant|reais|por\s+[0-9]|[uú]ltim|vendid|imperd[ií]vel|barat[ií]ssim/i.test(p.name);
 const copy=operationCopy[p.operation||'dropou'];
 const name=suspect?copy.generic:p.name.replace(/[\r\n*_~<>\[\]]/g,' ');
 return [copy.headline,'⚡ *'+name+'*','🛒 Veja o preço e a disponibilidade atualizados na loja 👇\n'+p.affiliateUrl,'As condições podem ter mudado.',copy.closing].join('\n\n');
}
export function publicationCaptionError(text:string,p:Product,mode:PublicationMode,now=Date.now()){
 const identity=publicationIdentityError(p);if(identity)return identity;
 if(mode==='safe')return text===safePublicationCaption(p)?null:'Sem conferência, use a versão local sem preços, descontos ou alegações de estoque.';
 if(!confirmedConditions(p,now))return 'A conferência venceu ou está incompleta. Confira agora ou continue com o texto sem valores.';
 const issue=captionError(text,p);if(issue)return issue;
 if(/frete\s+gr[aá]tis|cupom|brinde|[uú]ltimas?\s+unidades?|menor\s+pre[cç]o|desconto\s+garantido/i.test(text))return 'Remova alegações comerciais que não estão comprovadas nos dados da oferta.';
 if(/desconto|economiz/i.test(text)&&(!p.previousVerified||!p.previousPrice||p.previousPrice<=p.price))return 'O desconto não está comprovado nos dados da oferta.';
 return null;
}
export function savedCaptionError(text:string,p:Product){return text===safePublicationCaption(p)?publicationIdentityError(p):captionError(text,p);}
export function publicationPlan(p:Product,caption:string,preference:PublicationPreference='auto',now=Date.now()){
 const mode:PublicationMode=preference!=='safe'&&confirmedConditions(p,now)?'verified':'safe';
 const text=mode==='safe'?safePublicationCaption(p):caption;
 return {mode,text,error:publicationCaptionError(text,p,mode,now)};
}
export type PublicationPlan=ReturnType<typeof publicationPlan>;
export function serverClock(iso?:string){const parsed=iso?Date.parse(iso):NaN;return {instant:Number.isFinite(parsed)?parsed:Date.now(),started:performance.now()};}
export function clockNow(anchor:ReturnType<typeof serverClock>){return anchor.instant+Math.max(0,performance.now()-anchor.started);}
