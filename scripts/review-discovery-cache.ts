import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {loadCuratedDiscovery} from '../src/server/shopee/curation';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});

async function main(){
 const env=process.env,key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!env.NEXT_PUBLIC_SUPABASE_URL||new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co')throw new Error('Projeto inválido.');
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const settings=await db.from('operation_settings').select('owner_id').eq('brand_id','dropou');if(settings.error)throw settings.error;
 for(const setting of settings.data){
  const rows=await loadCuratedDiscovery(db,setting.owner_id),categories:Record<string,number>={};
  for(const row of rows)if(row.kind==='cache')categories[row.assessment.category]=(categories[row.assessment.category]||0)+1;
  console.log(JSON.stringify({recommendations:rows.filter(r=>r.kind==='cache').length,manual:rows.filter(r=>r.kind==='product').length,categories,providerCalls:0,messagesSent:0,writes:0}));
 }
}
main().catch(()=>{console.error('Leitura da curadoria falhou; nenhum dado foi alterado.');process.exitCode=1;});
