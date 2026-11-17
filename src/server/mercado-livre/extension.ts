import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {extensionImportSchema,extensionIdentity,extensionReviewSchema,reviewedExtensionProduct,type ExtensionInbox} from '@/lib/mercado-livre-extension';
import {productSchema,productKey} from '@/lib/domain';
import type {OperationId} from '@/lib/workspace-brands';
import {extensionProposal,assertSameExtensionRequest,extensionDraft} from './extension-core';
import {importMercadoLivre} from './import';
import {resolveMercadoLivreLink} from './resolve-link';
import {dbError} from '../session';
export async function receiveExtension(db:SupabaseClient,admin:SupabaseClient,owner:string,actor:string,operation:OperationId,raw:unknown){
 const input=extensionImportSchema.parse(raw);
 const query=()=>db.from('ml_extension_inbox').select('*').eq('owner_id',owner).eq('brand_id',operation).eq('request_id',input.requestId).maybeSingle();
 const before=await query();if(before.error)throw dbError(before.error);if(before.data){assertSameExtensionRequest(before.data,input);return before.data as ExtensionInbox;}
 const proposal=await extensionProposal(input,resolveMercadoLivreLink,value=>importMercadoLivre(db,admin,owner,operation,value.originalUrl));
 const draft=extensionDraft(input,proposal.result);
 const inserted=await admin.from('ml_extension_inbox').upsert({owner_id:owner,actor_id:actor,brand_id:operation,request_id:input.requestId,original_url:input.originalUrl,candidate_url:input.candidateUrl,identity_key:extensionIdentity(input),draft,message:proposal.result.message,existing:!!proposal.result.existingProductId,destination_match:proposal.destinationMatch},{onConflict:'owner_id,brand_id,request_id',ignoreDuplicates:true});
 if(inserted.error)throw dbError(inserted.error);
 const saved=await query();if(saved.error||!saved.data)throw new Error('Não foi possível confirmar o recebimento. Reconecte e tente o mesmo item.');assertSameExtensionRequest(saved.data,input);return saved.data as ExtensionInbox;
}
export async function prepareExtension(db:SupabaseClient,admin:SupabaseClient,owner:string,actor:string,operation:OperationId,raw:unknown){
 const input=extensionReviewSchema.parse(raw),read=await db.from('ml_extension_inbox').select('*').eq('owner_id',owner).eq('brand_id',operation).eq('id',input.id).single();if(read.error)throw dbError(read.error);
 const row=read.data as ExtensionInbox;
 // Repeated confirmations return the same canonical product; never overwrite an existing offer.
 const product=row.state==='prepared'?row.draft:reviewedExtensionProduct(row,input);
 const saved=await admin.rpc('dropou_ml_extension_prepare',{p_owner:owner,p_actor:actor,p_brand:operation,p_id:row.id,p_product:product,p_key:productKey(product)});if(saved.error)throw dbError(saved.error);
 return {product:productSchema.parse(saved.data.product),existing:saved.data.existing as boolean};
}
