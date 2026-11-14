import type {SupabaseClient} from '@supabase/supabase-js';
import {shopeeAutomation} from './automation';
import {assessShopeeOffer,shopeeConfigSchema} from '../../lib/shopee-automation';
import {shopeeProduct} from '../../lib/shopee-product';
import {formatCaption} from '../../lib/ai';
import {reserveDropouHeadline} from '../dropou-captions';
import type {OperationId} from '../../lib/workspace-brands';
// Preserve the existing explicit planning, preparation and repeat controls.
export async function manualShopeeAction(db:SupabaseClient,owner:string,brand:OperationId,body:{action:string;id?:string;decision?:string;confirmation?:string}){
 if(body.action==='plan'){
  if(brand==='dropou')return shopeeAutomation().plan(owner);
  return {mode:'simulation',preview:[],reviewRequired:true,message:'Use a curadoria para aprovar e agendar cada produto.'};
 }
 const row=await db.from('shopee_offers').select('*').eq('owner_id',owner).eq('brand_id',brand).eq('id',body.id!).single();if(row.error||!row.data)throw new Error('Oferta não encontrada neste canal.');
 const offer=row.data;
 if(body.action==='prepare'||body.action==='decide'&&body.decision==='approved'||body.action==='allow-repeat'){
  const settings=await db.from('operation_settings').select('shopee_config').eq('owner_id',owner).eq('brand_id',brand).single();if(settings.error)throw new Error('Configuração indisponível.');
  const assessment=brand==='dropou'?await shopeeAutomation().review(owner,offer.data):assessShopeeOffer(offer.data,shopeeConfigSchema.parse(settings.data.shopee_config),[],brand);
  if(!assessment.eligible)throw new Error('Aprovação bloqueada: '+assessment.reasons.join(' · '));
  if(body.action==='allow-repeat'){
   if(body.confirmation!=='LIBERAR REPETIÇÃO')throw new Error('Confirme explicitamente a repetição.');
   const r=await db.from('shopee_offers').update({repeat_until:new Date(Date.now()+600000).toISOString(),decision:'approved'}).eq('owner_id',owner).eq('brand_id',brand).eq('id',offer.id);if(r.error)throw new Error('Falha ao liberar repetição.');return {updated:true};
  }
  if(body.action==='prepare'&&offer.decision!=='approved')throw new Error('Aprove a oferta antes de preparar a publicação.');
  const product=shopeeProduct(offer.data,crypto.randomUUID(),brand),headline=brand==='dropou'?await reserveDropouHeadline(db,owner,'shopee:'+offer.id,product.name):undefined;
  const r=await db.rpc('dropou_shopee_stage_channel',{p_brand:brand,p_owner:owner,p_cache:offer.id,p_product:{...product,_draftCaption:formatCaption(product,brand,headline)},p_assessment:assessment});if(r.error)throw new Error('Não foi possível preparar o produto. Confira se foi arquivado.');return {updated:true,productId:r.data};
 }
 const changed=await db.from('shopee_offers').update({decision:body.decision}).eq('owner_id',owner).eq('brand_id',brand).eq('id',offer.id);if(changed.error)throw new Error('Não foi possível registrar a decisão.');
 const cancelled=await db.from('telegram_jobs').update({state:'cancelled',error:'Removida ou rejeitada na curadoria Shopee.'}).eq('owner_id',owner).eq('brand_id',brand).eq('state','queued').eq(offer.prepared_product_id?'product_id':'shopee_offer_id',offer.prepared_product_id||offer.id);if(cancelled.error)throw new Error('A decisão foi registrada; confira a fila antes de repetir.');
 return {updated:true};
}
