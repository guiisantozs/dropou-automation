import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {authUnavailable} from '@/lib/auth-errors';
import {operationForRequest} from '@/lib/workspace-brands';
export async function sessionDb(request:Request){
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))throw new Error('AUTH: Entre na sua conta.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('CONFIG: Configure a URL e a chave publicável do Supabase no servidor.');
 const operation=operationForRequest(request);
 const db=createClient(url,key,{global:{headers:{Authorization:authorization,'x-dropou-brand':operation}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(authorization.slice(7));
 if(error&&authUnavailable(error))throw new Error('UNAVAILABLE: Não foi possível conectar ao Supabase. Sua sessão não foi invalidada. Tente novamente.');
 if(error||!data.user)throw new Error('AUTH: Sessão expirada. Entre novamente.');
 // Resolve resource access through the user's RLS client before any service-role mutation.
 const resource=new URL(request.url).pathname.match(/^\/api\/(products|offers|publications)\/([0-9a-f-]{36})(?:\/|$)/i);
 if(resource){const scoped=await db.from(resource[1]).select('id').eq('owner_id',data.user.id).eq('id',resource[2]).maybeSingle();if(scoped.error)throw dbError(scoped.error);if(!scoped.data)throw new Error('Registro indisponível nesta operação. Selecione a marca correta.');}
 return {db,user:data.user,operation};
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
