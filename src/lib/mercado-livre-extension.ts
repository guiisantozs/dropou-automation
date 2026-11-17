import {z} from 'zod';
import {mercadoLivreIdentity,mercadoLivreUrl,mercadoLivreIdentityKey} from './mercado-livre-link';
import {isLocalOperation,operationSchema,type OperationScope} from './workspace-brands';
import {productSchema,type Product} from './domain';
export const dropouExtensionOrigin='https://dropou-automation.vercel.app';
export const extensionProtocol='dropou-ml-v1';
export const extensionImportSchema=z.object({requestId:z.string().uuid(),originalUrl:z.string().max(4096),candidateUrl:z.string().max(4096),itemId:z.string().regex(/^MLB\d{5,20}$/).nullable(),review:z.literal('candidate')}).strict().transform(value=>{
 const original=mercadoLivreIdentity(value.originalUrl),candidate=mercadoLivreUrl(value.candidateUrl);
 if(original.short||!original.itemId&&!original.catalogId)throw new Error('Abra o anúncio completo do vendedor no Mercado Livre e converta esse endereço.');
 if(value.itemId&&value.itemId!==original.itemId)throw new Error('A identificação recebida não corresponde ao anúncio original.');
 if(candidate.hostname!=='meli.la'||!/^\/[A-Za-z0-9_-]{1,200}$/.test(candidate.pathname)||candidate.search||candidate.hash)throw new Error('Envie o link meli.la gerado pelo conversor.');
 return {...value,originalUrl:original.url,candidateUrl:candidate.href,itemId:original.itemId};
});
export type ExtensionImport=z.output<typeof extensionImportSchema>;
export type ExtensionInbox={id:string;request_id:string;original_url:string;candidate_url:string;identity_key:string;draft:Product;message:string;state:'pending'|'prepared';product_id:string|null;existing:boolean;destination_match:boolean|null;created_at:string};
export function extensionOperation(operation:OperationScope){if(operation==='all'||isLocalOperation(operation))throw new Error('FORBIDDEN: Selecione uma operação autorizada com Mercado Livre.');return operationSchema.parse(operation);}
export function extensionIdentity(input:ExtensionImport){return mercadoLivreIdentityKey(input.originalUrl);}
export const extensionReviewSchema=z.object({id:z.string().uuid(),confirmed:z.literal(true),name:z.string().trim().min(3).max(180).optional(),price:z.number().positive().max(1e6).optional(),image:z.string().url().max(4096).optional(),variant:z.string().trim().min(1).max(100).optional(),inStock:z.boolean()}).strict();
export type ExtensionReview=z.infer<typeof extensionReviewSchema>;
export function reviewedExtensionProduct(row:ExtensionInbox,input:ExtensionReview):Product{
 const draft=row.draft,missingVariant=draft.visualDetails?.uncertainFields.includes('selectedVariant');
 if(missingVariant&&!input.variant)throw new Error('Informe a variante conferida no anúncio e no link.');
 const product=productSchema.parse({...draft,...(!draft.name?{name:input.name}:{}),...(!draft.price?{price:input.price,dataOrigin:'manual',source:undefined}:{}),...(!draft.image?{image:input.image}:{}),affiliateUrl:row.candidate_url,inStock:input.inStock,checkedAt:new Date().toISOString(),needsHumanReview:false,mercadoLivreImport:{...draft.mercadoLivreImport!,affiliateState:'informed',affiliateConfirmed:true},...(draft.visualDetails?{visualDetails:{...draft.visualDetails,selectedVariant:input.variant||draft.visualDetails.selectedVariant,uncertainFields:draft.visualDetails.uncertainFields.filter(f=>f!=='selectedVariant')}}:{})});
 if(!product.image&&!product.imagePath)throw new Error('Informe a foto real do anúncio.');
 return product;
}
