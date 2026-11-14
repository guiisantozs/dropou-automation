import {z} from 'zod';
import {caption, freshPrice, money, Product} from './domain';
import {safeInstallments,shortProductName} from './commerce';
import {dropouCaption,dropouCalls,dropouCategory} from './dropou-captions';

export const PROMPT_VERSION='dropou-2';
export const brands={
 celulares:{name:'Dropou Celulares & Gadgets',tone:'Prático, celulares e gadgets',closing:'📱 #publi | Dropou Celulares & Gadgets'},
 tenis:{name:'Dropou Tênis & Sneakers',tone:'Casual, esportivo, sem afirmar autenticidade não comprovada',closing:'👟 #publi | Dropou Tênis & Sneakers'},
 automoto:{name:'Dropou Auto & Moto',tone:'Útil, sem presumir compatibilidade',closing:'🚗 #publi | Dropou Auto & Moto'},
 dropou:{name:'Dropou Tech & Games',tone:'Jovem, tecnologia e games',closing:'💙 Dropou o preço? A gente te avisa!'},
 barato:{name:'Amiga, Tá Barato!',tone:'Amigável, moda, acessórios e achadinhos',closing:'💖 Amiga, tá barato! Compartilha esse achadinho!'},
 linda:{name:'Amiga, Tá Linda!',tone:'Acolhedor, beleza e autocuidado',closing:'✨ Amiga, tá linda! Seu momento de se cuidar!'},
 bruto:{name:'Bruto & Barato',tone:'Prático, direto, ferramentas, oficina e utilidade comprovada',closing:'🛠️ Bruto & Barato — ferramenta certa para o seu dia!'},
 moda:{name:'Moda Masculina',tone:'Moderno, estilo masculino e custo-benefício, sem promessas inventadas',closing:'🖤 Estilo e custo-benefício para o seu dia.'},
} as const;
export const brandSchema=z.enum(['dropou','barato','linda','bruto','moda','celulares','tenis','automoto']);
export type Brand=keyof typeof brands;
export const generationSchema=z.object({productIds:z.array(z.string().uuid()).min(1).max(20),brand:brandSchema.default('dropou'),variants:z.number().int().min(1).max(3).default(1)});
export type GenerationResult={productId:string;captions:string[];source:'openai'|'cache'|'local';message?:string;model?:string};
export function verifiedFacts(p:Product){
 return {...(p.operation&&p.operation!=='dropou'?{operation:p.operation}:{}),product:p.source?.itemId||p.id,marketplace:p.store,name:p.name,shortName:p.shortName||shortProductName(p.name),niche:p.niche,price:Math.round(p.price*100),previous:p.previousVerified&&p.previousPrice&&p.previousPrice>p.price?Math.round(p.previousPrice*100):null,payment:p.paymentMethod,pix:p.pixVerified,installments:p.installmentsVerified?p.installments:'',features:p.featuresVerified?p.features:[],social:p.socialVerified?p.visualDetails:null,link:p.affiliateUrl,origin:p.dataOrigin||'manual'};
}
export function generationError(p:Product){
 if(p.demo)return 'Dados demonstrativos não geram chamadas pagas.';
 if(!p.name||!p.affiliateUrl||!freshPrice(p)||p.inStock!==true)return 'Confirme nome, link, preço e estoque antes de gerar.';
 if(p.paymentMethod==='pix'&&!p.pixVerified)return 'Confirme a condição Pix antes de gerar.';
 if(p.dataOrigin==='screenshot'&&!p.screenshotConfirmed)return 'Confirme os dados extraídos do print.';
 return null;
}
export function localHeadline(p:Product,brand:Brand='dropou',variation=0){
 if(brand==='celulares')return ['📱 UM ACHADO PARA O SEU DIA!','🔌 UM UPGRADE PARA SUA ROTINA!','🎧 CONFIRA ESSE ACHADO TECH!'][variation%3];
 if(brand==='tenis')return ['👟 SEU PRÓXIMO PASSO ESTÁ AQUI!','✨ UM ACHADO PARA O SEU ESTILO!','🏃 CONFIRA ESSE MODELO!'][variation%3];
 if(brand==='automoto')return ['🚗 UM ACHADO PARA O SEU VEÍCULO!','🔧 UTILIDADE PARA SUA ROTINA!','🏍️ CONFIRA ESSE ACESSÓRIO!'][variation%3];
 if(brand==='dropou'){const calls=dropouCalls[dropouCategory(p.name)];return calls[variation%calls.length];}
 if(brand==='bruto')return ['🛠️ UMA FERRAMENTA PARA SUA ROTINA!','🔧 UTILIDADE PARA SUA OFICINA!','🧰 CONFIRA ESSE ACHADO!'][variation%3];
 if(brand==='moda')return ['👔 ESTILO PARA O SEU DIA!','👟 CONFIRA SEU PRÓXIMO LOOK!','🖤 UM ACHADO PARA SEU ESTILO!'][variation%3];
 if(brand==='linda')return ['✨ SEU MOMENTO DE SE CUIDAR!','💖 UM CARINHO NA SUA ROTINA!','✨ ENCONTRE SEU PRÓXIMO FAVORITO!'][variation%3];
 if(brand==='barato')return ['🛍️ AMIGA, OLHA ESSE ACHADINHO!','💖 ESSE ACHADO MERECE SUA ATENÇÃO!','✨ VEM CONFERIR ESSE ACHADINHO!'][variation%3];
 const name=p.name.toLowerCase();
 const start=/processador|ryzen|intel|cpu|memória|ssd/.test(name)?'🔥🖥️ UM UPGRADE PARA O SEU PC!':/webcam/.test(name)?'🎥🔥 QUER COMEÇAR A FAZER SUAS LIVES?':/controle/.test(name)?'🎮🔥 DÊ UM UPGRADE NA SUA GAMEPLAY!':/teclado/.test(name)?'⌨️🔥 SEU SETUP PEDE ESSE TECLADO!':/monitor/.test(name)?'🖥️🔥 UM NOVO OLHAR PARA SEU SETUP!':/headset|fone/.test(name)?'🎧🔥 ENTRE NO CLIMA DA PARTIDA!':/jogo|ps5|xbox/.test(name)?'🎮🔥 SUA PRÓXIMA PARTIDA COMEÇA AQUI!':'🔥 ENCONTRE SEU PRÓXIMO FAVORITO!';
 return variation===0?start:['💙 OLHA ESSE ACHADO PARA VOCÊ!','🔥 SEU PRÓXIMO UPGRADE ESTÁ AQUI!'][(variation-1)%2];
}
// Generated copy cannot supply facts, currency, URLs or unverified commercial claims.
export function safeHeadline(value:string,p:Product,brand:Brand,index=0){
 const text=value.trim();
 return text.length>=8&&text.length<=105&&!/[\d\n\r]|https?:|www\.|R\$|[%<>*_~]/i.test(text)&&!/(grátis|gratis|frete|estoque|últim|ultim|melhor|menor|garant|desconto|economi|barat[oí]ss|sem juros|vendid|avalia|hz|fps|resolu|original|imperdível|baixou|acabando)/i.test(text)?text:localHeadline(p,brand,index);
}
export function renderCaption(p:Product,brand:Brand='dropou',headline=localHeadline(p,brand)){
 if(!freshPrice(p)||generationError(p))return caption(p);
 return formatCaption(p,brand,headline);
}
// Draft previews use this formatter with an explicit "not revalidated" label in the UI.
export function formatCaption(p:Product,brand:Brand='dropou',headline=localHeadline(p,brand)){
 if(brand==='dropou')return dropouCaption(p,headline);
 const old=p.previousVerified&&p.previousPrice&&p.previousPrice>p.price?p.previousPrice:null;
 const savings=old?(Math.round(old*100)-Math.round(p.price*100))/100:0;
 return [headline+' #publi','⚡ *'+(p.shortName||shortProductName(p.name)).replace(/[\n\r*_~]/g,' ')+'*',[
  old?`💸 De: ~${money(old)}~`:'',`💙 *POR ${money(p.price)}${p.paymentMethod==='pix'?' no Pix':''}!*`,old?`🤑 ECONOMIZE ${money(savings)}!`:'',
 ].filter(Boolean).join('\n'),p.featuresVerified&&p.features?.length?(brand==='bruto'?'🛠️ ':brand==='moda'?'👔 ':'🎮 ')+p.features.slice(0,2).join(' | '):'',p.installmentsVerified&&safeInstallments(p.installments)?'💳 '+safeInstallments(p.installments):'',p.socialVerified&&p.visualDetails?[p.visualDetails.rating!==null?'⭐ Nota '+String(p.visualDetails.rating).replace('.',','):'',p.visualDetails.salesCount?'🛍️ '+p.visualDetails.salesCount:'',p.visualDetails.sellerName?'🏬 Vendedor: '+p.visualDetails.sellerName:''].filter(Boolean).join('\n'):'','🛒 CONFIRA A OFERTA 👇\n'+p.affiliateUrl,brands[brand].closing].filter(Boolean).join('\n\n');
}
export function localResult(p:Product,brand:Brand,variants:number,message?:string):GenerationResult{return {productId:p.id,captions:Array.from({length:variants},(_,i)=>renderCaption(p,brand,localHeadline(p,brand,i))),source:'local',message};}
