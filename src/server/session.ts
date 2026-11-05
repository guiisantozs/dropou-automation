import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {authUnavailable} from '@/lib/auth-errors';
export async function sessionDb(request:Request){
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))throw new Error('AUTH: Entre na sua conta.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('CONFIG: Configure a URL e a chave publicável do Supabase no servidor.');
 const db=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(authorization.slice(7));
 if(error&&authUnavailable(error))throw new Error('UNAVAILABLE: Não foi possível conectar ao Supabase. Sua sessão não foi invalidada. Tente novamente.');
 if(error||!data.user)throw new Error('AUTH: Sessão expirada. Entre novamente.');
 return {db,user:data.user};
}
export function apiError(error:unknown){
 const message=error instanceof Error?error.message:'Falha inesperada';
 const status=message.startsWith('AUTH:')?401:/^(CONFIG|UNAVAILABLE):/.test(message)?503:400;
 return Response.json({error:message.replace(/^(AUTH|CONFIG|UNAVAILABLE): /,'')},{status});
}
export function dbError(error:{code?:string;message:string}){
 if(error.code==='23505')return new Error('Produto ou publicação duplicada. Atualize o painel.');
 if(['42P01','42883','PGRST202','PGRST205'].includes(error.code||''))return new Error('A estrutura do banco não está configurada. Aplique schema.sql e whatsapp-flow.sql.');
 if(error.code==='P0001')return new Error(error.message);
 return new Error('O banco recusou a operação. Verifique a sessão, as permissões e o schema.');
}
