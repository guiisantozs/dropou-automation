// Explicit contract READ probe. One budgeted GraphQL query; no saved products or messages.
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {productBatchQuery,parseShopeeBatch,requestShopeeOperation} from '../src/server/shopee/client';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
async function main(){
 const env=process.env;if(!env.NEXT_PUBLIC_SUPABASE_URL||new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co')throw new Error('Projeto Dropou não configurado.');
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const admin=await db.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single();if(admin.error||admin.data.owner_ids.length!==1)throw new Error('Administrador único não confirmado.');const owner=admin.data.owner_ids[0];
 const rows=await db.from('shopee_offers').select('shop_id,item_id').eq('owner_id',owner).eq('brand_id','dropou').eq('eligible',true).limit(2);if(rows.error||!rows.data.length)throw new Error('Cache de referência indisponível.');
 const items=rows.data.map(r=>({shopId:r.shop_id,itemId:r.item_id})),query=productBatchQuery(items);
 const offers=await requestShopeeOperation(query,{appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'},async()=>{
  const r=await db.rpc('dropou_shopee_reserve',{p_owner:owner,p_key:'import-contract:'+crypto.randomUUID(),p_kind:'search',p_global_limit:Number(env.SHOPEE_DAILY_REQUEST_LIMIT||10)});if(r.error)throw new Error('Reserva de orçamento recusada.');return r.data;
 },async(id,state,retry)=>{const r=await db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry});if(r.error)throw new Error('Conclusão de orçamento não confirmada.');},raw=>parseShopeeBatch(raw,items));
 const report={checkedAt:new Date().toISOString(),requested:items.length,returned:offers.filter(Boolean).length,photos:offers.filter(o=>o?.image).length,affiliateLinks:offers.filter(o=>o?.offerLink).length,requestCount:1,messagesSent:0,productsSaved:0,query};
 mkdirSync('outputs/shopee-live',{recursive:true});writeFileSync('outputs/shopee-live/import-contract-'+Date.now()+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.returned)process.exitCode=1;
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Falha na consulta de leitura.');process.exitCode=1;});
