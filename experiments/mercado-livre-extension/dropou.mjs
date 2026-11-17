export const DROPOU_ORIGIN='https://dropou-automation.vercel.app';
export const CONNECTION_KEY='dropouPlatformConnection';
export function officialDropou(url){try{const u=new URL(url);return u.origin===DROPOU_ORIGIN&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function dropouPayload(item,requestId){
 if(item?.state!=='candidate'||typeof item.candidate!=='string')throw new Error('Conclua a conversão antes de enviar.');
 const candidate=new URL(item.candidate),source=new URL(item.source);
 if(candidate.origin!=='https://meli.la'||!/^\/[A-Za-z0-9_-]{1,200}$/.test(candidate.pathname)||candidate.search||candidate.hash)throw new Error('Envie um link meli.la válido gerado pelo conversor.');
 if(source.protocol!=='https:'||source.username||source.password||source.port||!['mercadolivre.com.br','www.mercadolivre.com.br','produto.mercadolivre.com.br'].includes(source.hostname))throw new Error('Anúncio original inválido.');
 const query=new URLSearchParams(source.search),fragment=new URLSearchParams(source.hash.slice(1));
 const selected=query.get('wid')||query.get('item_id')||fragment.get('wid')||fragment.get('item_id');
 const id=(selected||(!source.pathname.includes('/p/')?source.pathname:'')).match(/MLB-?(\d{5,20})(?=[^0-9]|$)/i);
 return {requestId,originalUrl:source.href,candidateUrl:candidate.href,itemId:id?'MLB'+id[1]:null,review:'candidate'};
}
