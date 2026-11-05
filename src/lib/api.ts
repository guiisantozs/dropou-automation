'use client';
import {supabase} from './supabase';
import {authUnavailable} from './auth-errors';
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(!supabase)throw new Error('Configure o Supabase antes de continuar.');
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Entre na sua conta.');
 const send=(token:string)=>fetch(path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 let response=await send(session.access_token);
 if(response.status===401){
  const refreshed=await supabase.auth.refreshSession();
  if(refreshed.error&&authUnavailable(refreshed.error))throw new Error('Não foi possível renovar a sessão por falha de conexão. Tente novamente.');
  if(refreshed.data.session)response=await send(refreshed.data.session.access_token);
  if(response.status===401){await supabase.auth.signOut({scope:'local'});throw new Error('Sessão expirada. Entre novamente.');}
 }
 const data=await response.json();if(!response.ok)throw new Error(data.error||'A operação falhou.');return data as T;
}
