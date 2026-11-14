import {operationCategories,type OperationId} from './workspace-brands';
import {productSchema} from './domain';
import type {ShopeeOffer} from './shopee-automation';

export function shopeeProduct(o:ShopeeOffer,id=crypto.randomUUID(),operation:OperationId='dropou'){
 return productSchema.parse({id,operation,name:o.name,niche:operationCategories[operation][0],store:'Shopee',price:o.price,previousPrice:null,previousVerified:false,originalUrl:`https://shopee.com.br/product/${o.shopId}/${o.itemId}`,affiliateUrl:o.offerLink,image:o.image,installments:'',installmentsVerified:false,inStock:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:o.checkedAt,status:'encontrado',scheduledAt:null,createdAt:new Date().toISOString(),demo:false,dataOrigin:'official',source:{provider:'shopee',itemId:o.shopId+':'+o.itemId,verifiedAt:o.checkedAt,priceEndpoint:'https://open-api.affiliate.shopee.com.br/graphql',referenceAmount:null,previousEvidence:'none'}});
}
