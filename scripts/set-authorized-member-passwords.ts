// Explicitly authorized two-account reset. Password is accepted only through stdin, never arguments/files.
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {findExistingMember,updateConfirmedPassword,validateMemberLogin,correctMemberAccess} from './lib/member-passwords';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';

async function targets(){
 nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||new URL(url).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co'||!key||!publishable)throw Error('Configuração local indisponível.');
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const config=await admin.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single();if(config.error||config.data.owner_ids.length!==1)throw Error('Proteção do proprietário indisponível.');
 const members=await admin.from('operation_members').select('member_id,display_name,role,active,brands').eq('owner_id',config.data.owner_ids[0]);
 if(members.error||members.data.length!==2||!members.data.every(correctMemberAccess))throw Error('As duas integrantes não foram identificadas com segurança.');
 const accounts=[];let nameMatches=0;
 for(const member of members.data){
  const r=await admin.auth.admin.getUserById(member.member_id);if(r.error||!r.data.user?.email||!r.data.user.email_confirmed_at)throw Error('Identidade ou confirmação de e-mail indisponível.');
  const u=r.data.user,labels=[member.display_name,u.email,u.user_metadata?.name,u.user_metadata?.full_name].filter(Boolean).join(' ').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  if(/karen|allison|alisson|luiza/.test(labels))nameMatches++;
  accounts.push(await findExistingMember(admin,u.email!,member.member_id));
 }
 if(nameMatches!==2)throw Error('Os nomes das duas contas não correspondem à autorização.');
 return {admin,accounts,url,publishable};
}
function privateInput(){
 return new Promise<string>((resolve,reject)=>{
  let value='';const input=process.stdin,raw=input.isTTY&&input.isRaw;
  if(input.isTTY)input.setRawMode(true);input.setEncoding('utf8');input.resume();
  function finish(){input.off('data',data);if(input.isTTY)input.setRawMode(!!raw);input.pause();}
  function data(chunk:string){if(chunk.includes('\u0003')){value='';finish();reject(Error('Cancelado.'));return;}value+=chunk;if(value.length>128){value='';finish();reject(Error('Entrada inválida.'));return;}if(/[\r\n]/.test(value)){const result=value.replace(/[\r\n]+$/,'');value='';finish();resolve(result);}}
  input.on('data',data);input.once('end',()=>{value='';reject(Error('Entrada incompleta.'));});
  process.stdout.write('Identidades confirmadas. Aguardando entrada privada por stdin.\n');
 });
}
async function main(){
 const check=process.argv.slice(2);if(check.length!==1||!['--check','--authorized'].includes(check[0])||process.env.VERCEL||process.env.CI)throw Error('Execução local autorizada exigida.');
 const {admin,accounts,url,publishable}=await targets();
 if(check[0]==='--check'){console.log(JSON.stringify({verified:true,existingMembers:accounts.length,exactScope:true,ownerProtected:true}));return;}
 if(existsSync('outputs/member-initial-passwords/authorized.used'))throw Error('Tentativa já reservada.');
 let password=await privateInput();if(password.length<8)throw Error('Senha abaixo do mínimo local.');
 const report:{account:number;passwordUpdated:boolean|null;loginValidated:boolean;membershipVerified:boolean}[]=[];
 mkdirSync('outputs/member-initial-passwords',{recursive:true});
 writeFileSync('outputs/member-initial-passwords/authorized.used','Explicit two-account authorization reserved. No automatic retry.\n',{flag:'wx',mode:0o600});
 try{
  for(let i=0;i<accounts.length;i++){
   const entry:{account:number;passwordUpdated:boolean|null;loginValidated:boolean;membershipVerified:boolean}={account:i+1,passwordUpdated:null,loginValidated:false,membershipVerified:false};report.push(entry);
   try{
    const scope=await updateConfirmedPassword(admin,accounts[i],password);entry.passwordUpdated=true;
    const client=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const loginScope=await validateMemberLogin(client,accounts[i],password);entry.loginValidated=true;entry.membershipVerified=scope&&loginScope;
    if(!entry.membershipVerified)throw Error('Vínculos divergentes após validação.');
    console.log('Sucesso: conta '+(i+1)+' atualizada, login e vínculos confirmados.');
   }finally{writeFileSync('outputs/member-initial-passwords/authorized-result.json',JSON.stringify(report),{mode:0o600});}
  }
 }finally{password='';accounts.length=0;}
}
main().catch(()=>{console.error('Erro: execução não concluída; confira somente o resultado seguro. Não há repetição automática.');process.exitCode=1;});
