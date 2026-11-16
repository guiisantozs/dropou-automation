import type {SupabaseClient} from '@supabase/supabase-js';
import type {OperationId} from '../../lib/workspace-brands';
import {parseShopeeBatch,productBatchQuery,requestShopeeOperation} from './client';
import {reserveShopee} from './budget';

export type ShopeeIdentity={shopId:string;itemId:string};
// productOfferV2 already returns this account's offerLink. Do not fabricate or
// append attribution parameters, and never use an incoming affiliate URL here.
export async function requestProductOffers(db:SupabaseClient,owner:string,brand:OperationId,items:ShopeeIdentity[],key:string,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch,purpose:'manual'|'mirror'='manual'){
 return requestShopeeOperation(productBatchQuery(items),{appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'},
  ()=>reserveShopee(db,owner,brand,key,purpose,env),
  async(id,state,retry)=>{const r=await db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry});if(r.error)throw new Error('Não foi possível concluir o controle de consumo Shopee.');},
  raw=>parseShopeeBatch(raw,items),http);
}
