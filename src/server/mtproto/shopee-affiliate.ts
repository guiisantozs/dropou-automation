import type {SupabaseClient} from '@supabase/supabase-js';
import type {Scope} from './store';
import type {MtprotoShopeeConversion} from '../../lib/telegram-mtproto-shopee';
import type {ShopeeOffer} from '../../lib/shopee-automation';
import {priceCurrent} from '../../lib/shopee-freshness';
import {shopeeProductLink} from '../../lib/shopee-saved';
import {parseShopeeOffers,ShopeeApiError} from '../shopee/client';
import {requestProductOffers,type ShopeeIdentity} from '../shopee/product-offers';

export type ConversionContext={valid:()=>boolean;signal:AbortSignal};
export type AffiliateConverter=(scope:Scope,id:ShopeeIdentity,context:ConversionContext)=>Promise<MtprotoShopeeConversion>;
const failure=(error:string):MtprotoShopeeConversion=>({state:'error',affiliateUrl:null,product:null,source:null,error});
function sameAffiliate(offer:ShopeeOffer,id:ShopeeIdentity){
 const parsed=shopeeProductLink(offer.offerLink),canonical=`https://shopee.com.br/product/${id.shopId}/${id.itemId}`;
 return offer.shopId===id.shopId&&offer.itemId===id.itemId&&offer.offerLink!==canonical&&(!parsed.shopId||parsed.shopId===id.shopId&&parsed.itemId===id.itemId);
}
function cachedOffer(raw:unknown,id:ShopeeIdentity,now:number):ShopeeOffer|null{
 if(!raw||typeof raw!=='object')return null;
 const o=raw as ShopeeOffer;
 if(o.shopId!==id.shopId||o.itemId!==id.itemId||!priceCurrent(o,now))return null;
 // Revalidate cache content with the same official-response parser, including
 // trusted URL hosts and exact identity; cache age alone is not sufficient.
 const [validated]=parseShopeeOffers({data:{productOfferV2:{nodes:[{shopId:o.shopId,itemId:o.itemId,productName:o.name,imageUrl:o.image,offerLink:o.offerLink,productLink:o.productLink,priceMin:o.price,priceMax:o.priceMax,ratingStar:o.rating,sales:o.sales,commissionRate:o.commission,priceDiscountRate:o.reportedDiscount}]}}},new Date(o.checkedAt));
 return validated&&sameAffiliate(validated,id)?validated:null;
}
export function mtprotoAffiliateConverter(db:SupabaseClient,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch,now=()=>Date.now(),purpose:'manual'|'mirror'='mirror'):AffiliateConverter{
 return async(scope,id,context)=>{
  try{
   if(scope.brand!=='dropou'||!context.valid())return failure('A janela de teste não está ativa.');
   if(!env.SHOPEE_AFFILIATE_APP_ID||!env.SHOPEE_AFFILIATE_SECRET||env.SHOPEE_AFFILIATE_APPROVED!=='true')throw new ShopeeApiError('credentials');
   const cache=await db.from('shopee_import_cache').select('data').eq('owner_id',scope.owner).eq('shop_id',id.shopId).eq('item_id',id.itemId).maybeSingle();
   if(cache.error)return failure('Cache Shopee indisponível. Nenhuma chamada à API foi realizada.');
   if(!context.valid())return failure('A janela terminou antes da conversão.');
   let offer=cachedOffer(cache.data?.data,id,now()),source:'api'|'cache'='cache';
   if(!offer){
    // Same product/time bucket cannot consume another API call after a worker
    // restart or test restart. Failures are not automatically retried.
    const key=['mtproto-affiliate',scope.owner,scope.brand,id.shopId,id.itemId,Math.floor(now()/900000)].join(':');
    const guardedHttp=(async(input,init)=>{if(!context.valid())throw new Error('closed');return http(input,{...init,signal:AbortSignal.any([context.signal,...(init?.signal?[init.signal]:[])])});}) as typeof fetch;
    [offer]=await requestProductOffers(db,scope.owner,'dropou',[id],key,env,guardedHttp,purpose);source='api';
    if(!context.valid())return failure('A janela terminou antes da conversão.');
    if(!offer)return failure('A API oficial não retornou uma oferta válida para estes IDs. Link e dados não foram gerados.');
    if(!sameAffiliate(offer,id))return failure('A resposta não contém um link afiliado válido para o mesmo produto.');
    const saved=await db.from('shopee_import_cache').upsert({owner_id:scope.owner,shop_id:id.shopId,item_id:id.itemId,data:offer,checked_at:offer.checkedAt},{onConflict:'owner_id,shop_id,item_id'});
    if(saved.error)return failure('A resposta chegou, mas não foi possível guardar o cache com segurança. Não repita a tentativa automaticamente.');
   }
   if(!context.valid())return failure('A janela terminou antes da conversão.');
   if(!sameAffiliate(offer,id))return failure('A resposta não contém um link afiliado válido para o mesmo produto.');
   return {state:'generated',affiliateUrl:offer.offerLink,error:null,source,product:{name:offer.name,image:offer.image,price:offer.price,priceMax:offer.priceMax,checkedAt:offer.checkedAt}};
  }catch(error){return failure(error instanceof ShopeeApiError?error.message:'Não foi possível concluir a conversão Shopee com segurança. Nenhuma nova tentativa automática será feita.');}
 };
}
