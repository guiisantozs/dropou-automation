import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ShopeeOffer} from '../../lib/shopee-automation';
export const shopeeEndpoint='https://open-api.affiliate.shopee.com.br/graphql';
export class ShopeeApiError extends Error{constructor(public code:string,public retrySeconds=0){super(({credentials:'Configure e autorize as credenciais da Shopee no servidor.',auth:'A Shopee recusou a autenticação. Confira App ID, Secret e relógio do servidor.',rate_limit:'Limite da Shopee atingido. A busca aguardará o backoff.',provider:'Shopee indisponível. A tentativa foi contabilizada.',contract:'Resposta incompatível com productOfferV2. Valide o contrato no portal oficial da sua conta.',budget:'Orçamento diário esgotado ou consulta já reservada.'} as Record<string,string>)[code]||'Consulta Shopee não concluída.');}}
export function shopeeAuthorization(appId:string,secret:string,body:string,timestamp=Math.floor(Date.now()/1000)){
 const signature=createHash('sha256').update(appId+timestamp+body+secret,'utf8').digest('hex');
 return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}
const id=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().refine(Number.isSafeInteger)]).transform(String);
const numeric=z.union([z.number(),z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number)]);
const optionalNumber=numeric.nullish().transform(v=>v??null);
const node=z.object({itemId:id,shopId:id,productName:z.string().trim().min(3).max(180),imageUrl:z.string().max(2048),offerLink:z.string().max(400),productLink:z.string().max(2048).optional(),priceMin:numeric,priceMax:numeric,ratingStar:optionalNumber,sales:optionalNumber,commissionRate:optionalNumber,priceDiscountRate:optionalNumber});
function trustedUrl(raw:string,domains:string[]){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))&&!/[\s<>]/.test(raw)?raw:'';}catch{return '';}}
export function parseShopeeOffers(raw:unknown,now=new Date()):ShopeeOffer[]{
 const response=z.object({data:z.object({productOfferV2:z.object({nodes:z.array(z.unknown()).max(100)})})}).safeParse(raw);
 if(!response.success)throw new ShopeeApiError('contract');
 return response.data.data.productOfferV2.nodes.flatMap(value=>{
  const result=node.safeParse(value);if(!result.success)return [];const n=result.data;
  const offerLink=trustedUrl(n.offerLink,['shopee.com.br','shope.ee']),image=trustedUrl(n.imageUrl,['shopee.com.br','shopee.com','susercontent.com','shopeemobile.com']);
  if(!offerLink||!image||n.priceMin<=0||n.priceMin>1000000||n.priceMax<n.priceMin||n.priceMax>1000000||n.ratingStar!==null&&(n.ratingStar<0||n.ratingStar>5)||n.sales!==null&&(!Number.isInteger(n.sales)||n.sales<0)||n.commissionRate!==null&&(n.commissionRate<0||n.commissionRate>1))return [];
  const productLink=n.productLink?trustedUrl(n.productLink,['shopee.com.br']):`https://shopee.com.br/product/${n.shopId}/${n.itemId}`;
  if(!productLink)return [];
  const seen=productLink.match(/(?:\/product\/(\d+)\/(\d+)|-i\.(\d+)\.(\d+))/);if(!seen||(seen[1]||seen[3])!==n.shopId||(seen[2]||seen[4])!==n.itemId)return [];
  return [{itemId:n.itemId,shopId:n.shopId,name:n.productName,image,offerLink,productLink,price:n.priceMin,priceMax:n.priceMax,rating:n.ratingStar,sales:n.sales,commission:n.commissionRate,reportedDiscount:n.priceDiscountRate,checkedAt:now.toISOString()}];
 });
}
// One bounded batch; optional fields are nullable, and a schema error fails closed.
export function productOfferQuery(input:{keyword?:string;itemId?:string;shopId?:string;limit:number;sortType?:1|2;listType?:0|2;categoryId?:number;page?:number}){
 const sort=input.sortType??(input.keyword?1:undefined);
 const args=[`page:${z.number().int().min(1).max(10).parse(input.page??1)}`,sort!==undefined?`sortType:${z.union([z.literal(1),z.literal(2)]).parse(sort)}`:'',`limit:${Math.max(1,Math.min(50,Math.floor(input.limit)))}`,input.listType!==undefined?`listType:${z.union([z.literal(0),z.literal(2)]).parse(input.listType)}`:'',input.categoryId!==undefined?`productCatId:${z.number().int().positive().max(2147483647).parse(input.categoryId)}`:'',input.keyword?`keyword:${JSON.stringify(input.keyword)}`:'',input.itemId?`itemId:${id.parse(input.itemId)}`:'',input.shopId?`shopId:${id.parse(input.shopId)}`:''].filter(Boolean).join(',');
 return `{productOfferV2(${args}){nodes{itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate}}}`;
}
export async function requestShopee(input:Parameters<typeof productOfferQuery>[0],credentials:{appId?:string;secret?:string;approved:boolean},reserve:()=>Promise<string|null>,finish:(id:string,state:string,retrySeconds:number)=>Promise<void>,http:typeof fetch=fetch):Promise<ShopeeOffer[]>{
 return requestShopeeOperation(productOfferQuery(input),credentials,reserve,finish,raw=>parseShopeeOffers(raw).slice(0,input.limit),http);
}
export async function requestShopeeOperation<T>(query:string,credentials:{appId?:string;secret?:string;approved:boolean},reserve:()=>Promise<string|null>,finish:(id:string,state:string,retrySeconds:number)=>Promise<void>,parse:(raw:any)=>T,http:typeof fetch=fetch):Promise<T>{
 if(!credentials.appId||!credentials.secret||!credentials.approved)throw new ShopeeApiError('credentials');
 const body=JSON.stringify({query}),requestId=await reserve();if(!requestId)throw new ShopeeApiError('budget');
 let outcome='provider',retry=60;
 try{
  const response=await http(shopeeEndpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:shopeeAuthorization(credentials.appId,credentials.secret,body)},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok){outcome=response.status===429?'rate_limit':[401,403].includes(response.status)?'auth':'provider';const after=response.headers.get('retry-after');retry=Math.min(86400,Math.max(60,Number(after)||Math.ceil((Date.parse(after||'')-Date.now())/1000)||60));throw new ShopeeApiError(outcome,retry);}
  const raw=await response.json();if(raw.errors?.length){
   if(!Array.isArray(raw.errors))throw new ShopeeApiError('contract');
   // A GraphQL HTTP 200 is not success. Classify the provider's error description;
   // 10000/System Error must not impose a one-day schema-contract suspension.
   const clues=raw.errors.map((e:{message?:unknown;extensions?:{code?:unknown;message?:unknown};code?:unknown})=>[e.extensions?.code,e.code,e.message,e.extensions?.message].map(String).join(' ')).join(' ');
   outcome=/429|rate.?limit|too many requests|quota/i.test(clues)?'rate_limit':/\b10020\b|\b401\b|\b403\b|auth|signature|no api access|permission|credential/i.test(clues)?'auth':/\b10000\b|system error|internal (?:server )?error|service unavailable/i.test(clues)?'provider':'contract';
   throw new ShopeeApiError(outcome,60);
  }
  const result=parse(raw);outcome='ok';retry=0;return result;
 }catch(e){if(e instanceof ShopeeApiError){outcome=e.code;retry=e.retrySeconds||60;throw e;}throw new ShopeeApiError('provider',60);}
 finally{await finish(requestId,outcome,retry);}
}
export function productBatchQuery(items:{shopId:string;itemId:string}[]){
 if(!items.length||items.length>5)throw new ShopeeApiError('contract');
 return '{'+items.map((item,i)=>'p'+i+':'+productOfferQuery({...item,limit:1}).slice(1,-1)).join(' ')+'}';
}
export function parseShopeeBatch(raw:any,items:{shopId:string;itemId:string}[]){
 return items.map((item,i)=>parseShopeeOffers({data:{productOfferV2:raw.data?.['p'+i]}}).find(o=>o.shopId===item.shopId&&o.itemId===item.itemId)||null);
}
