import type {Product} from '../../lib/domain';
import {emptyProduct} from '../../lib/product-draft';
import {mercadoLivreIdentity} from '../../lib/mercado-livre-link';
import {operationCategories,type OperationId} from '../../lib/workspace-brands';
export type ImportCheck={resource:'item'|'catalog'|'price';state:'available'|'denied'|'unauthorized'|'rate_limit'|'unavailable'|'configuration'|'pending';httpStatus?:number;code?:string;requestId?:string;cached?:boolean;retryAt?:string};
export type OfficialResponse={data:unknown;check:ImportCheck};
export type MercadoLivreVariant={id:string;label:string;price:number|null;image:string};
export type MercadoLivreImportResult={store:'Mercado Livre';product:Product;checks:ImportCheck[];missing:string[];message:string;needsScreenshot:boolean;existingProductId?:string;variants?:MercadoLivreVariant[]};
export type MercadoLivreRequest=(path:string,resource:ImportCheck['resource'])=>Promise<OfficialResponse>;
const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const price=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1e6?v:null;
function image(value:unknown){if(typeof value!=='string')return '';try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='http2.mlstatic.com'?u.href:'';}catch{return '';}}
function text(value:unknown,max:number){return typeof value==='string'?value.trim().slice(0,max):'';}
export async function importMercadoLivreData(input:{inputUrl:string;resolvedUrl:string;operation:OperationId},request:MercadoLivreRequest):Promise<MercadoLivreImportResult>{
 const identity=mercadoLivreIdentity(input.resolvedUrl),checks:ImportCheck[]=[],now=new Date().toISOString();
 const product:Product={...emptyProduct(),operation:input.operation,niche:operationCategories[input.operation][0],originalUrl:identity.short?'':identity.url,mercadoLivreImport:{inputUrl:input.inputUrl,resolvedUrl:input.resolvedUrl,itemId:identity.itemId,catalogId:identity.catalogId,userProductId:identity.userProductId||undefined,affiliateState:'pending',affiliateConfirmed:false},dataOrigin:'manual'};
 // A catalog entity identifies a model. It never proves the seller's price or stock.
 let data:Record<string,any>={},catalogId=identity.catalogId;
 if(identity.itemId){const r=await request('/items/'+identity.itemId,'item');checks.push(r.check);if(r.check.state==='available'&&record(r.data).id===identity.itemId){data=record(r.data);catalogId=/^MLB\d{5,20}$/.test(data.catalog_product_id)?data.catalog_product_id:catalogId;}}
 if(!identity.itemId&&catalogId){const r=await request('/products/'+catalogId,'catalog');checks.push(r.check);if(r.check.state==='available'&&record(r.data).id===catalogId)data=record(r.data);}
 product.name=text(data.title||data.name,180);
 product.image=(Array.isArray(data.pictures)?data.pictures:[]).map((p:any)=>image(p.secure_url||p.url)).find(Boolean)||image(data.secure_thumbnail);
 const attributes=Array.isArray(data.attributes)?data.attributes:[],attribute=(key:string)=>text(attributes.find((a:any)=>a.id===key)?.value_name,100)||null;
 const variations=Array.isArray(data.variations)?data.variations:[];
 const variants:MercadoLivreVariant[]=variations.map((v:any)=>({id:String(v.id),label:(Array.isArray(v.attribute_combinations)?v.attribute_combinations:[]).map((a:any)=>text(a.value_name,50)).filter(Boolean).join(' · ').slice(0,100),price:data.currency_id==='BRL'?price(v.price):null,image:image((data.pictures||[]).find((p:any)=>v.picture_ids?.includes(p.id))?.secure_url)})).filter(v=>v.label);
 product.visualDetails={brand:attribute('BRAND')?.slice(0,80)||null,model:attribute('MODEL'),selectedVariant:null,rating:null,salesCount:null,sellerName:null,displayedDiscount:null,uncertainFields:variations.length?['selectedVariant']:[]};
 if(variations.length)product.needsHumanReview=true;
 if(identity.itemId&&data.id===identity.itemId){
  const r=await request('/items/'+identity.itemId+'/sale_price?context=channel_marketplace','price');checks.push(r.check);const sale=record(r.data);
  if(r.check.state==='available'&&sale.currency_id==='BRL'&&price(sale.amount)){
   product.price=sale.amount;product.dataOrigin='official';product.source={provider:'mercado_livre',itemId:identity.itemId,verifiedAt:now,priceEndpoint:'https://api.mercadolibre.com/items/'+identity.itemId+'/sale_price?context=channel_marketplace',referenceAmount:price(sale.regular_amount),previousEvidence:'none'};
  }
  // The advertised BRL price remains useful when the separate sale-price resource is denied.
  else if(data.currency_id==='BRL'&&price(data.price)){product.price=data.price;product.dataOrigin='official';}
  product.inStock=data.status==='active'&&typeof data.available_quantity==='number'?data.available_quantity>0:data.status&&data.status!=='active'?false:null;
 }
 if(product.name||product.image)product.dataOrigin='official';
 product.mercadoLivreImport!.catalogId=catalogId;
 const missing=[!product.name?'nome':'',!product.price?'preço':'',!product.image?'imagem':'',variations.length?'variante':'','link de afiliado'].filter(Boolean);
 const denied=checks.some(c=>c.state==='denied'),configuration=checks.some(c=>c.state==='configuration');
 const message=denied?'O Mercado Livre recusou o acesso à API. Os dados disponíveis foram preservados; complete os campos pendentes.':configuration?'Link identificado. Conecte o Mercado Livre nas integrações para consultar dados; você também pode completar os campos agora.':product.name?'Dados disponíveis importados. Confira preço e variante e informe o link gerado na sua conta de afiliado.':'O link foi identificado, mas os dados estão indisponíveis. Complete os campos ou adicione um print.';
 return {store:'Mercado Livre',product,checks,missing,message,needsScreenshot:!product.name||!product.price,variants};
}
