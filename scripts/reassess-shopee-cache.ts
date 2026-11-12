import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {shopeeEngine} from '../src/server/shopee/engine';
import {shopeeConfigSchema,assessShopeeOffer,diversifyOffers,type OfferObservation} from '../src/lib/shopee-automation';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
async function main(){
 const env=process.env,key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!env.NEXT_PUBLIC_SUPABASE_URL||new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co'||env.SHOPEE_AUTOMATION_LIVE!=='false')throw new Error('Exige Dropou com publicação automática bloqueada.');
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const d=await db.from('telegram_dispatch_config').select('owner_ids,automation_enabled').eq('id',true).single();if(d.error||d.data.automation_enabled||d.data.owner_ids.length!==1)throw new Error('Exige administrador único e pausa.');
 const owner=d.data.owner_ids[0],s=await db.from('operation_settings').select('shopee_config,automation_enabled').eq('owner_id',owner).eq('brand_id','dropou').single();if(s.error||s.data.automation_enabled)throw new Error('Operação deve estar pausada.');
 const config=shopeeConfigSchema.parse(s.data.shopee_config);if(config.enabled||!config.dryRun)throw new Error('Exige simulação e rotina desligada.');
 const engine=shopeeEngine({db,env,http:async()=>{throw new Error('Proibido consultar provedores nesta revisão.');},target:async()=>{throw new Error('Sem destino de envio.');},telegramEnv:async()=>{throw new Error('Sem Telegram.');}});
 await engine.reassess(owner);
 const rows=await db.from('shopee_offers').select('id,data,assessment,decision').eq('owner_id',owner).eq('brand_id','dropou').limit(2000),history=await db.from('shopee_observations').select('shop_id,item_id,observed_at,sales,rating,price,price_max').eq('owner_id',owner).eq('brand_id','dropou').order('observed_at',{ascending:false}).limit(5000);
 if(rows.error||history.error)throw new Error('Falha ao conferir cache/histórico.');
 const assessed=rows.data.map(r=>({...r,assessment:assessShopeeOffer(r.data,config,history.data as OfferObservation[])}));
 const recommendations=diversifyOffers(assessed.filter(r=>!['rejected','removed'].includes(r.decision)),4).map(r=>({id:r.id,name:r.data.name,price:r.data.price,priceMax:r.data.priceMax,sales:r.data.sales,rating:r.data.rating,score:r.assessment.score,confidence:r.assessment.confidence,category:r.assessment.category,decision:r.decision,offerLink:r.data.offerLink}));
 const report={checkedAt:new Date().toISOString(),total:assessed.length,eligible:assessed.filter(r=>r.assessment.eligible).length,relevant:assessed.filter(r=>r.assessment.relevant).length,pendingReview:assessed.filter(r=>r.assessment.eligible&&r.decision==='found').length,approved:assessed.filter(r=>r.assessment.eligible&&r.decision==='approved').length,recommendations,observations:history.data.length,providerCalls:0,messagesSent:0,settingsChanged:false};
 mkdirSync('outputs/shopee-live',{recursive:true});writeFileSync('outputs/shopee-live/quality-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('Reavaliação não concluída. Nenhum envio ou retry automático.');process.exitCode=1;});
