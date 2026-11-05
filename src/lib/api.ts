'use client';
import {supabase} from './supabase';
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(!supabase)throw new Error('Configure o Supabase antes de continuar.');
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Entre na sua conta.');
 const response=await fetch(path,{method,headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'A operação falhou.');return data as T;
}
