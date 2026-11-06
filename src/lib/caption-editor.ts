import type {Product} from './domain';
import {parseInstallments} from './commerce';
import {monetaryValue} from './visual';
export function captionError(text:string,p:Product){
 if(!text.trim()||text.length>4000)return 'A legenda deve ter entre 1 e 4.000 caracteres.';
 if(!/(?:^|\s)#publi\b/i.test(text))return 'Mantenha #publi na legenda.';
 const urls:string[]=text.match(/https?:\/\/[^\s<>]+/g)||[];
 if(!p.affiliateUrl||!urls.includes(p.affiliateUrl)||urls.some(url=>url!==p.affiliateUrl))return 'Mantenha somente o link de afiliado original, sem alterar o rastreamento.';
 const cents=(v:number)=>Math.round(v*100),allowed=new Set([cents(p.price)]);
 if(p.previousVerified&&p.previousPrice&&p.previousPrice>p.price){allowed.add(cents(p.previousPrice));allowed.add(cents(p.previousPrice)-cents(p.price));}
 const plan=p.installmentsVerified?parseInstallments(p.installments):null;
 if(plan)allowed.add(cents(plan.amount));
 const rawAmounts=[...text.matchAll(/R\$\s*([\d.,]+)/g)].map(m=>monetaryValue(m[1]));
 if(rawAmounts.some(v=>v===null))return 'Use valores monetários completos, como R$ 447,05.';
 const amounts=rawAmounts.map(v=>cents(v!));
 if(!amounts.includes(cents(p.price)))return 'Mantenha o preço registrado na legenda; para mudá-lo, edite e confira o produto.';
 if(amounts.some(v=>!allowed.has(v)))return 'A legenda contém um valor diferente dos preços e condições comprovados.';
 if(/\bpix\b/i.test(text)&&p.paymentMethod!=='pix')return 'Pix não está confirmado para este preço.';
 for(const m of text.matchAll(/\b(\d+)\s*x\s*(?:de\s*)?R\$/gi))if(!plan||Number(m[1])!==plan.count)return 'Confira o parcelamento nos dados do produto antes de usá-lo na legenda.';
 if(/sem juros/i.test(text)&&!plan?.interestFree)return 'A condição sem juros não está comprovada.';
 const expectedDiscount=p.previousVerified&&p.previousPrice&&p.previousPrice>p.price?Math.floor((cents(p.previousPrice)-cents(p.price))*100/cents(p.previousPrice)):null;
 for(const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g))if(expectedDiscount===null||Math.abs(Number(m[1].replace(',','.'))-expectedDiscount)>1)return 'O desconto deve corresponder aos preços comprovados.';
 return null;
}
