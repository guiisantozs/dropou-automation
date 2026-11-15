import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {oauthAccessToken,requireOAuthAdmin} from './oauth';
import {importMercadoLivreData,type MercadoLivreRequest,type ImportCheck} from './import-core';
import {requestMercadoLivreImport} from './import-http';
import {resolveMercadoLivreLink} from './resolve-link';
import {mercadoLivreIdentity} from '../../lib/mercado-livre-link';
import type {OperationId} from '../../lib/workspace-brands';
import {productSchema} from '../../lib/domain';

export async function existingMercadoLivreProduct(db:SupabaseClient,owner:string,operation:OperationId,itemId:string|null){
 if(!itemId)return null;
 // Existing source metadata and old URL formats are recognized without reading another channel.
 const r=await db.from('products').select('id,data,archived_at').eq('owner_id',owner).eq('brand_id',operation).eq('data->>store','Mercado Livre').or('data->mercadoLivreImport->>itemId.eq.'+itemId+',data->source->>itemId.eq.'+itemId+',canonical_url.ilike.%'+itemId+'%,canonical_url.ilike.%MLB-'+itemId.slice(3)+'%');
 if(r.error)throw new Error('Não foi possível conferir anúncios já cadastrados.');
 const matches=r.data.filter(row=>{if(row.data.mercadoLivreImport?.itemId===itemId||row.data.source?.itemId===itemId)return true;try{return mercadoLivreIdentity(row.data.originalUrl||row.data.affiliateUrl).itemId===itemId;}catch{return false;}});
 return matches.find(row=>!row.archived_at)||matches[0]||null;
}
export async function importMercadoLivre(db:SupabaseClient,admin:SupabaseClient,owner:string,operation:OperationId,url:string){
 mercadoLivreIdentity(url);
 const saved=await db.from('operation_link_inbox').upsert({owner_id:owner,brand_id:operation,url,marketplace:'Mercado Livre'},{onConflict:'owner_id,brand_id,url',ignoreDuplicates:true});
 if(saved.error)throw new Error('Não foi possível guardar o link para importação. Tente novamente.');
 let resolved;let resolutionFailed=false;
 try{resolved=await resolveMercadoLivreLink(url);}catch{resolved={...mercadoLivreIdentity(url),inputUrl:url};resolutionFailed=true;}
 const old=await existingMercadoLivreProduct(db,owner,operation,resolved.itemId);
 if(old&&!old.archived_at){const product=productSchema.parse(old.data);return {store:'Mercado Livre',product,checks:[],missing:[],needsScreenshot:false,existingProductId:old.id,message:'Este anúncio já está cadastrado nesta operação. Abra a oferta existente para preservar suas edições, seu link e seu histórico.'};}
 const request=mercadoLivreImportRequest(admin,owner);
 const result=await importMercadoLivreData({inputUrl:url,resolvedUrl:resolved.url,operation},request);
 if(old?.archived_at)result.message+=' Há um cadastro arquivado deste anúncio; ele não será restaurado automaticamente.';
 if(resolutionFailed){result.product.mercadoLivreImport!.affiliateState='failed';result.message='O Mercado Livre não resolveu o link curto. Cole o endereço completo do produto; o link recebido foi preservado.';}
 return result;
}

export function mercadoLivreImportRequest(admin:SupabaseClient,owner:string):MercadoLivreRequest{
 let tokenPromise:Promise<string|null>|undefined;
 async function token(){if(!tokenPromise)tokenPromise=(async()=>{try{requireOAuthAdmin(owner);return process.env.MERCADO_LIVRE_ACCESS_TOKEN||await oauthAccessToken(owner);}catch{return null;}})();return tokenPromise;}
 const request:MercadoLivreRequest=async(path,resource)=>{
  const access=await token();if(!access)return {data:null,check:{resource,state:'configuration'}};
  const lease=crypto.randomUUID(),claim=await admin.rpc('dropou_ml_import_claim',{p_owner:owner,p_path:path,p_resource:resource,p_lease:lease});
  if(claim.error)throw new Error('O cache de importação Mercado Livre precisa da migração incremental. Seus dados e links foram preservados.');
  if(claim.data.mode!=='claimed')return {data:claim.data.data,check:claim.data.check as ImportCheck};
  const result=await requestMercadoLivreImport(path,resource,access),finish=await admin.rpc('dropou_ml_import_finish',{p_owner:owner,p_path:path,p_lease:lease,p_data:result.data,p_check:result.check,p_seconds:result.seconds});
  if(finish.error||!finish.data)throw new Error('Não foi possível registrar a consulta. Aguarde antes de tentar novamente.');
  return result;
 };
 return request;
}
