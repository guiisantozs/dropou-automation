export type InstallmentPlan={count:number;amount:number;interestFree:boolean};
// Only an entire, recognizable installment condition is accepted. Never publish raw OCR.
export function parseInstallments(value:string):InstallmentPlan|null{
 const match=value.trim().match(/^(?:em\s+|ou\s+)?(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})(?:\s+(sem juros|com juros))?[.!]?$/i);
 if(!match)return null;
 const count=Number(match[1]),amount=Number(match[2].replace(/\./g,'').replace(',','.'));
 return count>=2&&count<=24&&amount>0&&amount*count<=1e6?{count,amount,interestFree:match[3]?.toLowerCase()==='sem juros'}:null;
}
export function installmentText(plan:InstallmentPlan|null|undefined){
 return plan?`${plan.count}x de ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(plan.amount).replace(/\u00a0/g,' ')}${plan.interestFree?' sem juros':''}`:'';
}
export function safeInstallments(value:string){return installmentText(parseInstallments(value));}
export function navigationText(value:string){return /(?:conferir|ver|veja|explorar)\s+(?:mais|todos|outros)|produtos?\s+(?:da marca|relacionados)|(?:adicionar|adicionado) ao carrinho|comprar agora|voltar (?:ao|para)|busca(r)? produtos|in[ií]cio|categorias|ofertas do dia|siga a loja|visite a loja|mais vendidos|voc[eê] tamb[eé]m|quem (?:viu|comprou)|recomenda[çc][oõ]es/i.test(value);}
export function shortProductName(name:string){
 const clean=name.replace(/\s+/g,' ').trim();
 const cpu=clean.match(/(?:processador\s+)?(?:AMD\s+)?Ryzen\s+\d\s+[\d]{4,5}[A-Z]{0,3}/i);
 if(cpu)return 'Processador '+(cpu[0].replace(/^processador\s+/i,'').match(/^AMD/i)?'':'AMD ')+cpu[0].replace(/^processador\s+/i,'');
 const intel=clean.match(/(?:Intel\s+)?Core\s+i[3579][-\s]?\d{4,5}[A-Z]{0,3}/i);
 if(intel)return 'Processador '+(intel[0].match(/^Intel/i)?'':'Intel ')+intel[0];
 return clean.length<=65?clean:clean.slice(0,62).replace(/\s+\S*$/,'')+'…';
}
export type CategoryIcon='cpu'|'controller'|'monitor'|'game'|'headset'|'tool'|'keyboard'|'phone'|'package';
export function categoryIcon(p:{name:string;niche:string}):CategoryIcon{
 const text=p.name+' '+p.niche;
 return /processador|ryzen|intel|hardware|cpu|mem[oó]ria/i.test(text)?'cpu':/controle|gamepad|joystick/i.test(text)?'controller':/monitor|tela|display/i.test(text)?'monitor':/headset|fone|[aá]udio/i.test(text)?'headset':/ferramenta|furadeira/i.test(text)?'tool':/teclado|keyboard/i.test(text)?'keyboard':/celular|smartphone/i.test(text)?'phone':/jogo|games|ps5|xbox/i.test(text)?'game':'package';
}
