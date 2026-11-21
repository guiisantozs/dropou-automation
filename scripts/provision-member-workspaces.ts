// Explicit local administrator action. Password and identity arrive through private stdin only.
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {operationSchema} from '../src/lib/workspace-brands';
import {assertNotOwner,membership} from './lib/member-passwords';
import {privateInput} from './lib/private-input';

const inputSchema=z.object({email:z.email().transform(v=>v.trim().toLowerCase()),displayName:z.string().trim().min(1).max(80),password:z.string().min(8).max(128),brands:z.array(operationSchema).min(1)});
const report={accountCreated:false,existingAccount:false,membershipSaved:false,loginValidated:false,refreshValidated:false,scopeValidated:false,logoutValidated:false};
async function main(){
 const mode=process.argv.slice(2);if(mode.length!==1||!['--check','--apply'].includes(mode[0])||process.env.CI||process.env.VERCEL)throw Error('Local explicit execution required');
 nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const e=process.env,url=e.NEXT_PUBLIC_SUPABASE_URL,key=e.SUPABASE_SECRET_KEY||e.SUPABASE_SERVICE_ROLE_KEY,publishable=e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||new URL(url).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co'||!key||!publishable)throw Error('Wrong project');
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const admin=createClient(url,key,options);
 console.log('Aguardando configuração autorizada por stdin privado.');
 let raw=await privateInput();const input=inputSchema.parse(JSON.parse(raw));raw='';
 const hash=createHash('sha256').update(input.email).digest('hex'),dir='outputs/member-provisioning',marker=dir+'/'+hash+'.used';
 const config=await admin.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single();
 if(config.error||config.data?.owner_ids?.length!==1)throw Error('Owner protection unavailable');
 const owner=config.data.owner_ids[0] as string;
 const settings=await admin.from('operation_settings').select('brand_id').eq('owner_id',owner).in('brand_id',input.brands);
 if(settings.error||settings.data.length!==new Set(input.brands).size)throw Error('Install incremental dashboards migration first');
 let account:{id:string;email?:string}|undefined,complete=false;
 for(let page=1;page<=100;page++){
  const users=await admin.auth.admin.listUsers({page,perPage:100});if(users.error)throw Error('Auth lookup failed');
  for(const user of users.data.users)if(user.email?.toLowerCase()===input.email){if(account)throw Error('Ambiguous account');account={id:user.id,email:user.email};}
  if(users.data.users.length<100){complete=true;break;}
 }
 if(!complete)throw Error('Incomplete Auth lookup');
 const before=account?await assertNotOwner(admin,account.id):null;
 const brands=[...new Set([...(before?.brands||[]),...input.brands])];
 if(mode[0]==='--check'){input.password='';console.log(JSON.stringify({preflight:true,existingAccount:!!account,preservesExistingBrands:true,role:'operator',brandCount:brands.length}));return;}
 if(existsSync(marker))throw Error('Attempt already reserved; inspect Auth and membership before any new execution');
 mkdirSync(dir,{recursive:true});writeFileSync(marker,'Explicit member provisioning reserved. No automatic retry.\n',{flag:'wx',mode:0o600});
 try{
  if(!account){
   const result=await admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,user_metadata:{first_name:input.displayName}});
   if(result.error||!result.data.user?.id)throw Error('Account creation not confirmed; inspect Auth before retrying');
   account={id:result.data.user.id,email:result.data.user.email};report.accountCreated=true;
  }else report.existingAccount=true;
  const current=await assertNotOwner(admin,account.id);
  if(JSON.stringify(current)!==JSON.stringify(before))throw Error('Membership changed concurrently');
  const assigned=await admin.rpc('dropou_assign_member',{p_owner:owner,p_actor:owner,p_member:account.id,p_role:'operator',p_brands:brands,p_name:input.displayName});
  if(assigned.error)throw Error('Membership assignment failed');
  const after=await membership(admin,account.id);
  if(after?.owner_id!==owner||after?.role!=='operator'||!after.active||after.brands.length!==brands.length||!brands.every(b=>after.brands.includes(b)))throw Error('Membership verification failed');
  report.membershipSaved=true;
  const client=createClient(url,publishable,options);
  try{
   const login=await client.auth.signInWithPassword({email:input.email,password:input.password});
   if(login.error||login.data.user?.id!==account.id||!login.data.session)throw Error('Password login failed');report.loginValidated=true;
   const refreshed=await client.auth.refreshSession();if(refreshed.error||refreshed.data.user?.id!==account.id)throw Error('Session refresh failed');report.refreshValidated=true;
   const access=await client.rpc('dropou_access_context');
   if(access.error||access.data?.owner!==owner||access.data?.admin!==false||access.data?.brands?.length!==brands.length||!brands.every(b=>access.data.brands.includes(b)))throw Error('Access scope mismatch');report.scopeValidated=true;
  }finally{const logout=await client.auth.signOut({scope:'local'});report.logoutValidated=!logout.error;input.password='';}
  console.log(JSON.stringify(report));
 }finally{input.password='';writeFileSync(dir+'/'+hash+'-result.json',JSON.stringify(report),{mode:0o600});}
}
main().catch(()=>{console.error('Execução incompleta. Confira o relatório seguro em outputs/member-provisioning antes de repetir.');process.exitCode=1;});
