// Marketplace identity and affiliate attribution are deliberately separate.
const hosts=new Set(['mercadolivre.com.br','www.mercadolivre.com.br','produto.mercadolivre.com.br','meli.la']);
export const mercadoLivreLinkBuilder='https://www.mercadolivre.com.br/afiliados/linkbuilder';
export function mercadoLivreUrl(input:string){
 let u:URL;try{u=new URL(input.trim());}catch{throw new Error('Informe um link HTTPS do Mercado Livre.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname)||u.href.length>4096)throw new Error('Use um link HTTPS oficial do Mercado Livre ou meli.la, sem credenciais ou porta.');
 return u;
}
const id=(v:string|null)=>v?.match(/^MLB-?(\d{5,20})$/i)?.[1];
export function mercadoLivreIdentity(input:string){
 const u=mercadoLivreUrl(input),query=new URLSearchParams(u.search),fragment=new URLSearchParams(u.hash.slice(1));
 const requested=id(query.get('wid'))||id(query.get('item_id'))||id(fragment.get('wid'))||id(fragment.get('item_id'));
 const catalog=u.pathname.match(/\/p\/(MLB\d{5,20})(?:\/|$)/i)?.[1]?.toUpperCase()||null;
 const userProduct=u.pathname.match(/\/up\/(MLBU\d{1,20})(?:\/|$)/i)?.[1]?.toUpperCase()||null;
 const listing=!catalog?u.pathname.match(/(?:^|\/)(MLB)-?(\d{5,20})(?=[-_/.]|$)/i)?.[2]:null;
 const short=u.hostname==='meli.la'||u.pathname.startsWith('/sec/');
 return {url:u.href,itemId:short?null:requested?'MLB'+requested:listing?'MLB'+listing:null,catalogId:short?null:catalog,userProductId:short?null:userProduct,short,affiliateHint:u.hostname==='meli.la'||[...query.keys()].some(k=>k.startsWith('matt_'))};
}
export function mercadoLivreIdentityKey(input:string){const p=mercadoLivreIdentity(input);return p.itemId?'item:'+p.itemId:p.catalogId?'catalog:'+p.catalogId:'url:'+p.url.split('#')[0];}
export function sameMercadoLivreListing(a:string,b:string){const x=mercadoLivreIdentity(a),y=mercadoLivreIdentity(b);return !!x.itemId&&x.itemId===y.itemId;}
