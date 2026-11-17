// Local operator tool only. Never import from src/ or expose through an HTTP route.
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {localPrompt} from './lib/local-prompt';
import {findExistingMember,passwordIssue,updateConfirmedPassword,validateMemberLogin,type ExistingMember} from './lib/member-passwords';

async function main(){
 if(process.argv.length!==2||!process.stdin.isTTY||!process.stdout.isTTY||process.env.CI||process.env.VERCEL)throw new Error('Use somente o comando local interativo, sem argumentos, CI ou deploy.');
 nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||new URL(url).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co'||!key||!publishable)throw new Error('Configure o projeto Dropou e a chave administrativa somente no ambiente local.');
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),accounts:ExistingMember[]=[],passwords:string[]=[];
 try{
  for(let i=0;i<2;i++){
   const email=(await localPrompt(`Conta ${i+1}: e-mail exato (visível apenas neste terminal):`)).trim();
   const id=(await localPrompt(`Conta ${i+1}: confirme o ID copiado do painel Supabase Auth (visível apenas neste terminal):`)).trim();
   const account=await findExistingMember(admin,email,id);if(accounts.some(a=>a.id===account.id))throw new Error('Selecione duas contas diferentes.');accounts.push(account);
   console.log(`Sucesso: conta ${i+1} existente e identidade confirmada; proprietário protegido.`);
  }
  if(await localPrompt('Para autorizar apenas as duas trocas, digite CONFIRMAR (visível apenas neste terminal):')!=='CONFIRMAR')throw new Error('Operação cancelada antes de qualquer troca.');
  for(let i=0;i<2;i++){
   let password=await localPrompt(`Conta ${i+1}: nova senha, entre 12 e 128 caracteres (visível apenas neste terminal):`),again=await localPrompt(`Conta ${i+1}: repita a nova senha (visível apenas neste terminal):`);
   const issue=passwordIssue(password,again);again='';if(issue){password='';throw new Error(issue);}passwords.push(password);password='';
  }
  // Both accounts and passwords have been confirmed before the FIRST write.
  for(const a of accounts)await findExistingMember(admin,a.email,a.id);
  const dir=resolve('outputs/member-initial-passwords');mkdirSync(dir,{recursive:true});
  const markers=accounts.map(a=>resolve(dir,createHash('sha256').update(url+'|'+a.id).digest('hex')+'.used'));
  if(markers.some(marker=>existsSync(marker)))throw new Error('Já existe uma tentativa reservada para uma das contas. Confira os resultados antes de continuar.');
  for(const marker of markers)try{writeFileSync(marker,'Attempt reserved; never retry automatically.\n',{flag:'wx',mode:0o600});}catch{throw new Error('Já existe uma tentativa reservada. Nenhuma troca será repetida automaticamente.');}
  const report:{account:number;passwordUpdated:boolean|null;loginValidated:boolean;membershipVerified:boolean}[]=[];
  for(let i=0;i<2;i++){
   const a=accounts[i];
   const entry:{account:number;passwordUpdated:boolean|null;loginValidated:boolean;membershipVerified:boolean}={account:i+1,passwordUpdated:null,loginValidated:false,membershipVerified:false};report.push(entry);
   try{
    const membershipOk=await updateConfirmedPassword(admin,a,passwords[i]);entry.passwordUpdated=true;console.log(`Sucesso: senha da conta ${i+1} atualizada.`);
    const client=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const accessOk=await validateMemberLogin(client,a,passwords[i]);entry.loginValidated=true;entry.membershipVerified=membershipOk&&accessOk;
    console.log(`Sucesso: login da conta ${i+1} validado.`);
    console.log(entry.membershipVerified?`Sucesso: conta ${i+1} vinculada somente às três operações autorizadas.`:`Erro: confira a associação da conta ${i+1} em Configurações → Equipe: perfil Integrante, ativo, somente Toque de Beleza, Cantinho & Charme e Clima de Natal. Nenhum vínculo foi alterado.`);
   }finally{passwords[i]='';writeFileSync(resolve(dir,'result.json'),JSON.stringify(report),{mode:0o600});}
  }
 }finally{passwords.fill('');accounts.length=0;}
}
main().catch(e=>{console.error('Erro: '+(e instanceof Error&&/^(Use somente|Execute diretamente|Configure o projeto|Não foi possível|A conta |O e-mail|Informe |Localização|A associação|A troca|A senha|Selecione |Operação cancelada|As senhas|Use uma senha|Já existe)/.test(e.message)?e.message:'Não foi possível concluir. Confira o ambiente local e o painel Auth; nenhuma repetição automática será feita.'));process.exitCode=1;});
