import type {SupabaseClient} from '@supabase/supabase-js';
import {curatedDiscovery} from '../../lib/shopee-curation';
import {shopeeConfigSchema} from '../../lib/shopee-automation';

async function allRows(query:(from:number,to:number)=>PromiseLike<{data:any[]|null;error:unknown}>){
 const rows:any[]=[];
 for(let page=0;page<20;page++){
  const result=await query(page*500,page*500+499);
  if(result.error)throw new Error('Não foi possível ler o cache da curadoria. Tente atualizar.');
  rows.push(...result.data||[]);if((result.data?.length||0)<500)return rows;
 }
 throw new Error('Cache grande demais para esta revisão. Reduza o acervo antes de continuar; a contagem não foi truncada.');
}
export async function loadCuratedDiscovery(db:SupabaseClient,owner:string){
 const scoped=(table:string,columns:string)=>db.from(table).select(columns).eq('owner_id',owner).eq('brand_id','dropou');
 const [cache,products,proofs,history,settings]=await Promise.all([
  allRows((from,to)=>scoped('shopee_offers','id,shop_id,item_id,data,decision,prepared_product_id').order('id').range(from,to)),
  allRows((from,to)=>scoped('products','id,data,canonical_url,curation_state,archived_at').order('id').range(from,to)),
  allRows((from,to)=>scoped('dropou_operation_publications','product_id,id,channel,source').order('id').order('channel').order('source').range(from,to)),
  allRows((from,to)=>scoped('shopee_observations','shop_id,item_id,observed_at,sales,price,price_max,rating').gte('observed_at',new Date(Date.now()-30*86400000).toISOString()).order('observed_at').order('shop_id').order('item_id').range(from,to)),
  db.from('operation_settings').select('shopee_config').eq('owner_id',owner).eq('brand_id','dropou').single(),
 ]);
 if(settings.error||!settings.data)throw new Error('Configuração da curadoria indisponível.');
 return curatedDiscovery(cache,products,new Set(proofs.map(p=>p.product_id)),shopeeConfigSchema.parse(settings.data.shopee_config),history);
}
