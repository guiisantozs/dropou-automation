import {celularFacts} from './celulares-curation';
import {operationCategories,type OperationId} from './workspace-brands';
import {productSchema} from './domain';
import type {ShopeeOffer} from './shopee-automation';

export function shopeeProduct(o:ShopeeOffer,id=crypto.randomUUID(),operation:OperationId='dropou'){
 const facts=operation==='celulares'?celularFacts(o.name):null;
 return productSchema.parse({...(facts?{visualDetails:{brand:null,model:facts.model,selectedVariant:[facts.storageGB?facts.storageGB+' GB':null,facts.ramGB?facts.ramGB+' GB RAM':null].filter(Boolean).join(' · ')||null,condition:facts.condition||undefined,rating:o.rating,salesCount:o.sales===null?null:String(o.sales),sellerName:null,displayedDiscount:null,uncertainFields:[]},features:facts.warranty?['Garantia anunciada: '+facts.warranty]:[],featuresVerified:false}:{}),id,operation,name:o.name,niche:operationCategories[operation][0],store:'Shopee',price:o.price,previousPrice:null,previousVerified:false,originalUrl:`https://shopee.com.br/product/${o.shopId}/${o.itemId}`,affiliateUrl:o.offerLink,image:o.image,installments:'',installmentsVerified:false,inStock:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:o.checkedAt,status:'encontrado',scheduledAt:null,createdAt:new Date().toISOString(),demo:false,dataOrigin:'official',source:{provider:'shopee',itemId:o.shopId+':'+o.itemId,verifiedAt:o.checkedAt,priceEndpoint:'https://open-api.affiliate.shopee.com.br/graphql',referenceAmount:null,previousEvidence:'none'}});
}
