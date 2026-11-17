import {extensionImportSchema,type ExtensionInbox,type ExtensionImport} from '../../lib/mercado-livre-extension';
import {mercadoLivreIdentity} from '../../lib/mercado-livre-link';
import type {MercadoLivreImportResult} from './import-core';
/** Candidate validation is independent of official-data availability and never proves commission. */
export async function extensionProposal(raw:unknown,resolve:(url:string)=>Promise<{itemId:string|null;catalogId:string|null}>,load:(input:ExtensionImport)=>Promise<MercadoLivreImportResult>){
 const input=extensionImportSchema.parse(raw),source=mercadoLivreIdentity(input.originalUrl);
 let destination:{itemId:string|null;catalogId:string|null}|undefined;
 try{destination=await resolve(input.candidateUrl);}catch{/* A blocked redirect remains explicitly unverified. */}
 if(source.itemId&&destination?.itemId&&source.itemId!==destination.itemId||!source.itemId&&source.catalogId&&destination?.catalogId&&source.catalogId!==destination.catalogId)throw new Error('O link candidato aponta para outro anúncio. Gere novamente o link correto.');
 const result=await load(input);
 return {input,result,destinationMatch:source.itemId&&destination?.itemId?true:null};
}
export function assertSameExtensionRequest(row:Pick<ExtensionInbox,'original_url'|'candidate_url'>,input:ExtensionImport){if(row.original_url!==input.originalUrl||row.candidate_url!==input.candidateUrl)throw new Error('Identificador de solicitação já usado para outros links. Gere uma nova conversão.');}
export function extensionDraft(input:ExtensionImport,result:MercadoLivreImportResult){
 const identity=mercadoLivreIdentity(input.originalUrl),variantPending=!result.existingProductId&&result.product.visualDetails?.uncertainFields.includes('selectedVariant');
 // A generic listing price does not prove the price of a variant still to be selected.
 return {...result.product,originalUrl:input.originalUrl,...(variantPending?{price:0,source:undefined}:{}),mercadoLivreImport:{inputUrl:input.originalUrl,resolvedUrl:input.originalUrl,itemId:identity.itemId,catalogId:identity.catalogId,affiliateState:'pending' as const,affiliateConfirmed:false}};
}
