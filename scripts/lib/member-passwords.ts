import type {SupabaseClient} from '@supabase/supabase-js';

export const memberBrands=['beleza','casa','natal'] as const;
export type ExistingMember={id:string;email:string;membership:unknown};
export function correctMemberAccess(value:{role?:string;active?:boolean;brands?:string[]}|null|undefined){
 return !!value&&value.role==='operator'&&value.active===true&&Array.isArray(value.brands)&&value.brands.length===3&&memberBrands.every(b=>value.brands!.includes(b));
}
export function passwordIssue(password:string,confirmation:string){
 if(password.length<12||password.length>128)return 'Use uma senha de 12 a 128 caracteres.';
 if(password!==confirmation)return 'As senhas não coincidem.';
 return null;
}
export async function membership(admin:SupabaseClient,id:string){
 const r=await admin.from('operation_members').select('owner_id,member_id,role,brands,active').eq('member_id',id).maybeSingle();
 if(r.error)throw new Error('Não foi possível conferir a associação de equipe.');return r.data;
}
export async function assertNotOwner(admin:SupabaseClient,id:string){
 const config=await admin.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single();
 if(config.error||!config.data?.owner_ids?.length)throw new Error('Não foi possível confirmar a proteção do proprietário.');
 if(config.data.owner_ids.includes(id))throw new Error('A conta proprietária não pode ser modificada.');
 for(const table of ['operation_settings','operation_members']){
  const r=await admin.from(table).select('owner_id').eq('owner_id',id).limit(1);
  if(r.error)throw new Error('Não foi possível confirmar a proteção do proprietário.');
  if(r.data?.length)throw new Error('A conta administra uma equipe e não pode ser modificada.');
 }
 const m=await membership(admin,id);
 if(m&&m.role!=='operator')throw new Error('A conta não possui perfil de integrante. Confira pelo painel administrativo.');
 if(m&&!config.data.owner_ids.includes(m.owner_id))throw new Error('A conta pertence a outro workspace.');
 return m;
}
export async function findExistingMember(admin:SupabaseClient,email:string,confirmedId:string):Promise<ExistingMember>{
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||! /^[0-9a-f-]{36}$/i.test(confirmedId))throw new Error('Informe o e-mail exato e o ID confirmado no painel Auth.');
 let match:{id:string;email?:string}|undefined,complete=false;
 for(let page=1;page<=100;page++){
  const r=await admin.auth.admin.listUsers({page,perPage:100});if(r.error)throw new Error('Não foi possível localizar a conta existente.');
  for(const user of r.data.users)if(user.email===email){if(match)throw new Error('Localização ambígua; nenhuma senha foi alterada.');match={id:user.id,email:user.email};}
  if(r.data.users.length<100){complete=true;break;}
 }
 if(!complete||!match||match.id!==confirmedId)throw new Error('O e-mail e o ID não identificam a mesma conta existente. Nenhuma alteração executada.');
 const checked=await admin.auth.admin.getUserById(match.id);
 if(checked.error||checked.data.user?.id!==confirmedId||checked.data.user.email!==email)throw new Error('A conta divergiu da confirmação. Nenhuma alteração executada.');
 return {id:confirmedId,email,membership:await assertNotOwner(admin,confirmedId)};
}
export async function updateConfirmedPassword(admin:SupabaseClient,account:ExistingMember,password:string){
 const current=await findExistingMember(admin,account.email,account.id);
 if(JSON.stringify(current.membership)!==JSON.stringify(account.membership))throw new Error('A associação de equipe mudou. Confira antes de continuar.');
 const r=await admin.auth.admin.updateUserById(account.id,{password});
 if(r.error||r.data.user?.id!==account.id)throw new Error('A troca não foi confirmada. Não repita automaticamente; confira no painel Auth.');
 const after=await membership(admin,account.id);
 if(JSON.stringify(after)!==JSON.stringify(account.membership))throw new Error('A senha foi atualizada, mas o vínculo mudou externamente. Confira a equipe pelo painel.');
 return correctMemberAccess(after);
}
export async function validateMemberLogin(client:SupabaseClient,account:ExistingMember,password:string){
 const r=await client.auth.signInWithPassword({email:account.email,password});
 if(r.error||r.data.user?.id!==account.id||!r.data.session){await client.auth.signOut({scope:'local'});throw new Error('Não foi possível validar o login. Confira a confirmação do e-mail e as políticas do Auth.');}
 try{
  const access=await client.rpc('dropou_access_context');
  return !access.error&&access.data?.actor===account.id&&access.data?.admin===false&&Array.isArray(access.data.brands)&&access.data.brands.length===3&&memberBrands.every(b=>access.data.brands.includes(b));
 }finally{await client.auth.signOut({scope:'local'});}
}
