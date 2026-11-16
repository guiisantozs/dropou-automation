import type {SupabaseClient} from '@supabase/supabase-js';
import type {OperationId} from '../../lib/workspace-brands';
import {shopeeLimit} from '../../lib/shopee-limits';
import {ShopeeApiError} from './client';

// Shared reservation for explicit imports, searches and controlled MTProto tests.
export async function reserveShopee(db:SupabaseClient,owner:string,brand:OperationId,key:string,purpose:'manual'|'search'|'mirror',env:Record<string,string|undefined>){
 const r=await db.rpc('dropou_shopee_reserve_v2',{p_owner:owner,p_brand:brand,p_key:key,p_kind:purpose,p_global_limit:shopeeLimit(env,purpose)});
 if(r.error)throw new Error('Controle de consumo Shopee indisponível. Confira a migração incremental.');
 if(!r.data?.id)throw new ShopeeApiError(r.data?.reason||'budget',r.data?.retryAt?Math.max(1,Math.ceil((Date.parse(r.data.retryAt)-Date.now())/1000)):0);
 return r.data.id as string;
}
