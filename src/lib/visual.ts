import {z} from 'zod';
import {Brand,formatCaption,localHeadline,safeHeadline} from './ai';
import type {Product} from './domain';
import {navigationText,parseInstallments,safeInstallments,shortProductName} from './commerce';
import type {OcrFields} from './ocr';
export const VISUAL_VERSION='dropou-visual-2';
export const visualFields=['productName','brand','model','selectedVariant','currentPrice','previousPrice','displayedDiscount','paymentCondition','installments','rating','salesCount','features','sellerName'] as const;
export type VisualField=typeof visualFields[number];
const nullableText=(max:number)=>z.string().trim().min(1).max(max).nullable();
export function monetaryValue(input:unknown):number|null{
 if(input===null)return null;
 if(typeof input==='string'){
  const value=input.replace(/R\$|\s/g,'');
  if(value.includes(',')){if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{1,2}$/.test(value))return null;input=Number(value.replace(/\./g,'').replace(',','.'));}
  else {if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;input=Number(value);}
 }
 return typeof input==='number'&&Number.isFinite(input)&&input>0&&input<=1e6?Math.round((input+Number.EPSILON)*100)/100:null;
}
const amount=z.preprocess(v=>v===null?null:monetaryValue(v),z.number().positive().max(1e6).nullable());
const decimal=(max:number)=>z.preprocess(v=>typeof v==='string'?Number(v.replace('%','').replace(',','.')):v,z.number().min(0).max(max).nullable());
export const visualSchema=z.object({
 productName:nullableText(180),brand:nullableText(80),model:nullableText(100),selectedVariant:nullableText(100),
 currentPrice:amount,previousPrice:amount,pixPrice:amount.optional(),displayedDiscount:decimal(100),paymentCondition:z.enum(['pix','card','general']).nullable(),
 installments:nullableText(100),rating:decimal(5),salesCount:nullableText(60),features:z.array(z.string().trim().min(1).max(80)).max(6).nullable(),
 sellerName:nullableText(120),creativeHeadline:nullableText(105),uncertainFields:z.array(z.enum(visualFields)).max(visualFields.length),
 priceContext:z.enum(['selected_product','related_product','coupon','affiliate_commission','ambiguous','not_visible']),
 discountContext:z.enum(['consumer','affiliate_commission','ambiguous','not_visible']),
});
export type VisualExtraction=z.infer<typeof visualSchema>;
export type VisualResult={extraction?:VisualExtraction;source:'openai'|'cache'|'local';key?:string;model?:string;message?:string;diagnostic?:{status:number;code:string;param?:string;requestId?:string};estimatedUsd:number;usage?:{input:number;output:number;cost:number}};
export function ocrVisualResult(fields:OcrFields,fallback?:Pick<VisualResult,'message'|'diagnostic'|'model'>):VisualResult{
 const extraction:VisualExtraction={productName:fields.name||null,brand:null,model:null,selectedVariant:null,currentPrice:fields.price,previousPrice:fields.previousPrice,displayedDiscount:null,paymentCondition:fields.paymentCondition||null,installments:fields.installments||null,rating:null,salesCount:null,features:fields.features.length?fields.features:null,sellerName:null,creativeHeadline:null,uncertainFields:['productName','currentPrice',...(fields.uncertain.includes('parcelamento')?['installments' as const]:[])],priceContext:fields.price?'selected_product':'ambiguous',discountContext:'not_visible'};
 return {...fallback,source:'local',extraction,estimatedUsd:0};
}
export function validateVisual(raw:unknown):VisualExtraction{
 const data=visualSchema.parse(raw),uncertain=new Set(data.uncertainFields);
 for(const field of ['currentPrice','previousPrice'] as const)if((raw as Record<string,unknown>)[field]!==null&&data[field]===null)uncertain.add(field);
 if(data.productName&&navigationText(data.productName))data.productName=null;
 if(!data.productName)uncertain.add('productName');
 if(data.installments){const safe=safeInstallments(data.installments);if(!safe)uncertain.add('installments');data.installments=safe||null;}
 if(data.priceContext!=='selected_product'||uncertain.has('selectedVariant')||uncertain.has('currentPrice')){data.currentPrice=null;uncertain.add('currentPrice');}
 if(data.priceContext!=='selected_product'||uncertain.has('selectedVariant')||uncertain.has('paymentCondition'))data.pixPrice=null;
 if(!data.currentPrice)uncertain.add('currentPrice');
 if(data.previousPrice&&(!data.currentPrice||data.previousPrice<=data.currentPrice)){data.previousPrice=null;uncertain.add('previousPrice');}
 if(data.discountContext!=='consumer')data.displayedDiscount=null;
 if(data.displayedDiscount!==null){
  const calculated=data.previousPrice&&data.currentPrice?((Math.round(data.previousPrice*100)-Math.round(data.currentPrice*100))*100)/Math.round(data.previousPrice*100):null;
  if(calculated===null||Math.abs(calculated-data.displayedDiscount)>1){data.displayedDiscount=null;uncertain.add('displayedDiscount');}
 }
 // An explicitly ambiguous optional fact is omitted until the administrator corrects it.
 for(const field of ['previousPrice','displayedDiscount','rating','salesCount','installments','features','sellerName'] as const)if(uncertain.has(field))Object.assign(data,{[field]:null});
 data.uncertainFields=[...uncertain];return data;
}
export function priceMath(price:number,previous:number|null){
 const current=Math.round(price*100),old=previous===null?0:Math.round(previous*100);
 return current>0&&old>current?{savings:(old-current)/100,discount:Math.floor((old-current)*100/old)}:null;
}
export function visualDraft(base:Product,result:VisualExtraction,brand:Brand):Product{
 const name=result.productName||'';
 const variant=result.selectedVariant&&!name.toLowerCase().includes(result.selectedVariant.toLowerCase())?' — '+result.selectedVariant:'';
 return {...base,name:(name+variant).slice(0,180),shortName:shortProductName(name+variant),price:result.currentPrice||0,pixPrice:result.pixPrice??(result.paymentCondition==='pix'?result.currentPrice:null),previousPrice:result.previousPrice,previousVerified:false,
  paymentMethod:result.paymentCondition==='pix'?'pix':result.paymentCondition==='card'?'outro':'nao_informado',pixVerified:false,
  installments:safeInstallments(result.installments||''),installmentPlan:parseInstallments(result.installments||'')||undefined,installmentsVerified:false,features:result.features?.slice(0,2)||[],featuresVerified:false,
  dataOrigin:'screenshot',screenshotConfirmed:false,checkedAt:null,inStock:null,source:undefined,status:'encontrado',scheduledAt:null,
  creativeHeadline:safeHeadline(result.creativeHeadline||localHeadline({...base,name},brand),{...base,name},brand),creativeBrand:brand,
  visualDetails:{brand:result.brand,model:result.model,selectedVariant:result.selectedVariant,rating:result.rating,salesCount:result.salesCount,sellerName:result.sellerName,displayedDiscount:result.displayedDiscount,uncertainFields:result.uncertainFields},socialVerified:false,
 };
}
export function visualPreview(p:Product,brand:Brand){
 if(!p.name||p.price<=0)return 'Confirme o nome e o preço indicados para concluir a prévia.';
 return formatCaption({...p,previousVerified:!!p.previousPrice,featuresVerified:true,installmentsVerified:true,socialVerified:true},brand,p.creativeHeadline||localHeadline(p,brand));
}
