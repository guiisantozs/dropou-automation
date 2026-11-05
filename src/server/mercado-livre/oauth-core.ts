import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
export const callbackPath='/api/oauth/mercado-livre/callback';
export class OAuthFailure extends Error{constructor(public code:string,message:string){super(message);}}
export function redirectUri(origin:string){
 let u:URL;try{u=new URL(origin);}catch{throw new OAuthFailure('configuration','Configure APP_BASE_URL com o domínio HTTPS real do deploy.');}
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname))throw new OAuthFailure('configuration','APP_BASE_URL deve ser uma origem HTTPS pública, sem caminho, query ou fragmento.');
 return u.origin+callbackPath;
}
export const hash=(input:string)=>createHash('sha256').update(input).digest('base64url');
export function newHandshake(){const verifier=randomBytes(32).toString('base64url');return {state:randomBytes(32).toString('base64url'),browser:randomBytes(32).toString('base64url'),verifier,challenge:hash(verifier)};}
export function cipherKey(base64:string){const key=Buffer.from(base64,'base64');if(key.length!==32||key.toString('base64')!==base64)throw new OAuthFailure('configuration','MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY deve conter 32 bytes aleatórios em base64.');return key;}
export function seal(text:string,key:Buffer,aad:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
export function unseal(value:string,key:Buffer,aad:string){try{const [version,iv,tag,data,...extra]=value.split('.');if(version!=='v1'||extra.length||!iv||!tag||!data)throw new Error();const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}catch{throw new OAuthFailure('vault','Não foi possível abrir o cofre da conexão. Confira a chave do servidor ou refaça a autorização.');}}
export const tokenSchema=z.object({access_token:z.string().min(10),refresh_token:z.string().min(10),token_type:z.string().refine(s=>s.toLowerCase()==='bearer'),expires_in:z.number().int().positive().max(2592000),user_id:z.union([z.number().int(),z.string().regex(/^\d+$/)]),scope:z.string().optional()});
export type TokenSet=z.infer<typeof tokenSchema>;
export function authorizationUrl(clientId:string,redirect:string,state:string,challenge:string){
 const u=new URL('https://auth.mercadolivre.com.br/authorization');u.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirect,state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return u.toString();
}
export async function requestTokens(params:URLSearchParams,http:typeof fetch=fetch):Promise<TokenSet>{
 let response:Response;try{response=await http('https://api.mercadolibre.com/oauth/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});}catch{throw new OAuthFailure('uncertain','O Mercado Livre não confirmou a troca de tokens. Refaça a conexão; não reutilize o código ou refresh token.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok){const code=data?.error==='invalid_grant'?'invalid_grant':data?.error==='invalid_client'?'invalid_client':'provider_error';throw new OAuthFailure(code,code==='invalid_grant'?'Autorização inválida ou já utilizada. Conecte novamente.':code==='invalid_client'?'O Mercado Livre recusou o Client ID/Secret. Verifique a configuração no servidor.':`O Mercado Livre recusou a troca de tokens (HTTP ${response.status}).`);}
 const result=tokenSchema.safeParse(data);if(!result.success)throw new OAuthFailure('uncertain','Resposta de tokens incompleta. Refaça a conexão para não reutilizar um refresh token possivelmente rotacionado.');return result.data;
}
export type Connection={owner_id:string;ml_user_id:string;encrypted_tokens:string;expires_at:string;status:'active'|'refreshing'|'reconnect_required'|'refresh_uncertain';version:string;lock_id:string|null;refresh_started_at:string|null};
export interface TokenStore{
 load(owner:string):Promise<Connection|null>;
 claim(owner:string,version:string,lock:string):Promise<boolean>;
 rotate(owner:string,version:string,lock:string,tokens:TokenSet,key:Buffer):Promise<boolean>;
 fail(owner:string,version:string,lock:string,status:'reconnect_required'|'refresh_uncertain'):Promise<void>;
}
export async function activeAccessToken(owner:string,store:TokenStore,key:Buffer,client:{id:string;secret:string},http:typeof fetch=fetch){
 const connection=await store.load(owner);if(!connection)return null;
 if(connection.status==='refreshing')throw new OAuthFailure('refreshing','A conexão está sendo renovada. Aguarde e tente novamente.');
 if(connection.status!=='active')throw new OAuthFailure('reconnect','A conexão precisa de nova autorização no Mercado Livre.');
 let tokens:TokenSet;try{tokens=tokenSchema.parse(JSON.parse(unseal(connection.encrypted_tokens,key,`connection:${owner}:${connection.ml_user_id}`)));}catch{throw new OAuthFailure('vault','Não foi possível validar os tokens armazenados. Refaça a conexão.');}
 if(Date.parse(connection.expires_at)>Date.now()+120000)return tokens.access_token;
 const lock=randomBytes(16).toString('hex');
 if(!await store.claim(owner,connection.version,lock))throw new OAuthFailure('refreshing','Outra execução está renovando a conexão. Aguarde e tente novamente.');
 try{
  const refreshed=await requestTokens(new URLSearchParams({grant_type:'refresh_token',client_id:client.id,client_secret:client.secret,refresh_token:tokens.refresh_token}),http);
  if(String(refreshed.user_id)!==connection.ml_user_id)throw new OAuthFailure('uncertain','A conta retornada não corresponde à conexão.');
  if(!await store.rotate(owner,connection.version,lock,refreshed,key))throw new OAuthFailure('changed','A conexão foi alterada durante a renovação. Tente novamente.');
  return refreshed.access_token;
 }catch(e){await store.fail(owner,connection.version,lock,e instanceof OAuthFailure&&e.code==='invalid_grant'?'reconnect_required':'refresh_uncertain');throw e;}
}
