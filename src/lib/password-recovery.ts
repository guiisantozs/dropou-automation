import type {SupabaseClient} from '@supabase/supabase-js';

export const recoveryPath='/redefinir-senha';
export function recoveryCredentials(hash:string){
 const p=new URLSearchParams(hash.replace(/^#/,''));
 if(p.has('error')||p.has('error_code')||p.get('type')!=='recovery')return null;
 const access_token=p.get('access_token'),refresh_token=p.get('refresh_token');
 return access_token&&refresh_token?{access_token,refresh_token}:null;
}
export function newPasswordError(password:string,confirmation:string){
 if(password.length<12||password.length>128)return 'Use uma senha de 12 a 128 caracteres.';
 return password===confirmation?null:'As senhas não coincidem.';
}
export async function establishPasswordRecovery(client:SupabaseClient,hash:string){
 const credentials=recoveryCredentials(hash);if(!credentials)return false;
 const r=await client.auth.setSession(credentials);if(r.error||!r.data.session)return false;
 const verified=await client.auth.getUser();return !verified.error&&verified.data.user?.id===r.data.session.user.id;
}
export async function saveRecoveredPassword(client:SupabaseClient,password:string){
 const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw new Error('Link inválido ou expirado. Solicite um novo link.');
 const r=await client.auth.updateUser({password});
 if(r.error||r.data.user?.id!==verified.data.user.id)throw new Error('Não foi possível atualizar a senha. Confira os requisitos ou solicite um novo link.');
 await client.auth.signOut({scope:'local'});
}
