export type OcrFields={name:string;price:number|null;previousPrice:number|null;installments:string;features:string[];uncertain:string[];paymentCondition?:'pix'|'card'|'general'|null};
export function parseScreenshot(text:string,confidence:number):OcrFields{
 const all=text.split(/\n/).map(s=>s.trim()).filter(Boolean);
 const related=all.findIndex(l=>/^(produtos? relacionados?|recomenda(dos?|ções)|você também|voce tambem|compre junto|outros vendedores|quem viu)/i.test(l));
 const lines=related>=0?all.slice(0,related):all;
 const value=(s:string)=>Number(s.replace(/\./g,'').replace(',','.'));
 const prices=lines.flatMap((line,i)=>[...line.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map(m=>({value:value(m[1]),line,i}))).filter(p=>p.value>0&&p.value<=1000000);
 const previous=prices.find(p=>/\bde\s*:?\s*R\$/i.test(p.line));
 const candidates=prices.filter(p=>p!==previous&&!/\d+\s*x|parcela|frete|econom|cupom|ganhos?|comiss[aã]o/i.test(p.line));
 const marked=candidates.filter(p=>/por|pix/i.test(p.line));
 const current=marked.length===1?marked[0]:marked.length===0&&candidates.length===1?candidates[0]:undefined;
 const title=lines.find(l=>l.length>=8&&l.length<=180&&!/R\$|vendid|avalia|frete|cupom|shopee|mercado livre|^\d+\s*x|%|^(comprar|adicionar)/i.test(l))||'';
 const installments=lines.find(l=>/\b\d+\s*x\s*(?:de\s*)?R\$/i.test(l))||'';
 const features=lines.filter(l=>l!==title&&l.length<=80&&/\b\d+\s*(?:Hz|GB|TB|MP|ms|W)\b/i.test(l)).slice(0,2);
 return {name:title,price:current?.value??null,previousPrice:previous?.value??null,installments,features,paymentCondition:current&&/pix/i.test(current.line)?'pix':current?'general':null,uncertain:[...(!title?['nome']:[]),...(!current?['preço']:[]),...(confidence<85?['leitura com baixa confiança']:[]),'preço anterior e condições exigem confirmação','estoque e validade atual exigem conferência na loja']};
}
