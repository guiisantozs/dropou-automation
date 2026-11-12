import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {resolveTelegramTarget} from '../src/server/telegram-core';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
async function main(){
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!key||!url||new URL(url).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co')throw new Error('Selecione o projeto Dropou configurado.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),admins=await db.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single();
 if(admins.error||admins.data.owner_ids.length!==1)throw new Error('Exige o administrador único desta operação.');
 const owner=admins.data.owner_ids[0],s=await db.from('operation_settings').select('telegram_chat_id').eq('owner_id',owner).eq('brand_id','dropou').single();
 if(s.error||!s.data.telegram_chat_id)throw new Error('Salve o canal Dropou antes de verificar.');
 const methods:string[]=[],http:typeof fetch=async(input,init)=>{const method=new URL(String(input)).pathname.split('/').pop()!;if(!['getMe','getChat','getChatMember'].includes(method))throw new Error('Este diagnóstico não permite enviar mensagens.');methods.push(method);return fetch(input,init);};
 const target=await resolveTelegramTarget({...process.env,TELEGRAM_CHAT_ID:s.data.telegram_chat_id,TELEGRAM_CHANNEL_ID:s.data.telegram_chat_id},http);
 if(target.id!==s.data.telegram_chat_id)throw new Error('O canal retornado diverge do cadastro. Confira o destino.');
 const verifiedAt=new Date().toISOString(),saved=await db.from('operation_settings').update({telegram_title:target.title,telegram_verified_at:verifiedAt}).eq('owner_id',owner).eq('brand_id','dropou').eq('telegram_chat_id',target.id).select('brand_id');
 if(saved.error||saved.data.length!==1)throw new Error('O destino mudou durante a verificação. Atualize a tela.');
 console.log(JSON.stringify({verified:true,title:target.title,verifiedAt,methods,messagesSent:0,automationChanged:false}));
}
main().catch(()=>{console.error('Não foi possível verificar o canal. Confira o token e a permissão de administrador do bot.');process.exitCode=1;});
