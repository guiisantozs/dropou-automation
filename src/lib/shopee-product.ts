import {productSchema} from './domain';
import type {ShopeeOffer} from './shopee-automation';

export function shopeeProduct(o:ShopeeOffer,id=crypto.randomUUID()){
 return productSchema.parse({id,operation:'dropou',name:o.name,niche:'Tech & Games',store:'Shopee',price:o.price,previousPrice:null,previousVerified:false,originalUrl:`https://shopee.com.br/product/${o.shopId}/${o.itemId}`,affiliateUrl:o.offerLink,image:o.image,installments:'',installmentsVerified:false,inStock:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:o.checkedAt,status:'encontrado',scheduledAt:null,createdAt:new Date().toISOString(),demo:false,dataOrigin:'official',source:{provider:'shopee',itemId:o.shopId+':'+o.itemId,verifiedAt:o.checkedAt,priceEndpoint:'https://open-api.affiliate.shopee.com.br/graphql',referenceAmount:null,previousEvidence:'none'}});
}
