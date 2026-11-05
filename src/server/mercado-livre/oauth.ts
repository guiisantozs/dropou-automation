import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb} from '../db';
import {activeAccessToken,cipherKey,Connection,hash,newHandshake,OAuthFailure,redirectUri,requestTokens,seal,TokenSet,TokenStore,unseal,authorizationUrl} from './oauth-core';
export const oauthCookie='__Host-dropou-ml-oauth';
export function oauthConfig(){
 const redirect=redirectUri(process.env.APP_BASE_URL||'');
 const id=process.env.MERCADO_LIVRE_CLIENT_ID,secret=process.env.MERCADO_LIVRE_CLIENT_SECRET;
 if(!id||!secret)throw new OAuthFailure('configuration','Configure MERCADO_LIVRE_CLIENT_ID e MERCADO_LIVRE_CLIENT_SECRET somente no servidor.');
 if(!/^\d+$/.test(id))throw new OAuthFailure('configuration','Client ID do Mercado Livre inválido.');
 if(process.env.MERCADO_LIVRE_REDIRECT_URI&&process.env.MERCADO_LIVRE_REDIRECT_URI!==redirect)throw new OAuthFailure('configuration','MERCADO_LIVRE_REDIRECT_URI deve coincidir exatamente com APP_BASE_URL e o caminho de callback.');
 return {id,secret,redirect,key:cipherKey(process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY||'')};
}
export function requireOAuthAdmin(owner:string){const allowed=(process.env.MERCADO_LIVRE_ADMIN_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);if(!allowed.includes(owner))throw new OAuthFailure('forbidden','Este usuário não está autorizado a administrar a conexão do Mercado Livre.');}
export function requireOAuthOrigin(request:Request){const expected=new URL(redirectUri(process.env.APP_BASE_URL||'')).origin;if(request.headers.get('origin')!==expected)throw new OAuthFailure('forbidden','Origem da solicitação não autorizada.');}
function vault(){try{return adminDb();}catch{throw new OAuthFailure('configuration','Configure a chave privada do Supabase somente no servidor para acessar o cofre OAuth.');}}
function check(error:unknown){if(error)throw new OAuthFailure('vault','O cofre OAuth não está disponível. Verifique o schema e as credenciais do servidor.');}
export async function startOAuth(owner:string){
 requireOAuthAdmin(owner);const config=oauthConfig(),db=vault(),h=newHandshake(),stateHash=hash(h.state);
 const {error}=await db.from('mercado_livre_oauth_flows').insert({state_hash:stateHash,owner_id:owner,browser_hash:hash(h.browser),encrypted_verifier:seal(h.verifier,config.key,`flow:${stateHash}:${owner}`),expires_at:new Date(Date.now()+600000).toISOString()});check(error);
 // Dados expirados não podem ser consumidos; limpeza não decide a validade do fluxo.
 await db.from('mercado_livre_oauth_flows').delete().lt('expires_at',new Date().toISOString());
 return {url:authorizationUrl(config.id,config.redirect,h.state,h.challenge),browser:h.browser};
}
export async function finishOAuth(input:{state:string;browser:string;code:string}){
 const config=oauthConfig();if(!/^[A-Za-z0-9_-]{43}$/.test(input.state)||!/^[A-Za-z0-9_-]{43}$/.test(input.browser)||!input.code||input.code.length>4096)throw new OAuthFailure('state','Solicitação OAuth inválida ou expirada.');
 const db=vault(),stateHash=hash(input.state);
 // DELETE RETURNING consome atomicamente. Repetições nunca chegam à API de tokens.
 const {data:flow,error}=await db.from('mercado_livre_oauth_flows').delete().eq('state_hash',stateHash).eq('browser_hash',hash(input.browser)).gt('expires_at',new Date().toISOString()).select('owner_id,encrypted_verifier').maybeSingle();check(error);
 if(!flow)throw new OAuthFailure('state','State inválido, expirado, de outro navegador ou já utilizado.');
 requireOAuthAdmin(flow.owner_id);
 const verifier=unseal(flow.encrypted_verifier,config.key,`flow:${stateHash}:${flow.owner_id}`);
 const tokens=await requestTokens(new URLSearchParams({grant_type:'authorization_code',client_id:config.id,client_secret:config.secret,code:input.code,redirect_uri:config.redirect,code_verifier:verifier}));
 const {error:saveError}=await db.from('mercado_livre_connections').upsert({owner_id:flow.owner_id,ml_user_id:String(tokens.user_id),encrypted_tokens:seal(JSON.stringify(tokens),config.key,`connection:${flow.owner_id}:${tokens.user_id}`),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),status:'active',version:randomUUID(),lock_id:null,refresh_started_at:null,updated_at:new Date().toISOString()});check(saveError);
}
export function tokenStore():TokenStore{
 const db=vault();return {
  async load(owner){const {data,error}=await db.from('mercado_livre_connections').select('*').eq('owner_id',owner).maybeSingle();check(error);return data as Connection|null;},
  async claim(owner,version,lock){const {data,error}=await db.from('mercado_livre_connections').update({status:'refreshing',lock_id:lock,refresh_started_at:new Date().toISOString()}).eq('owner_id',owner).eq('version',version).eq('status','active').select('owner_id').maybeSingle();check(error);return !!data;},
  async rotate(owner,version,lock,tokens,key){const {data,error}=await db.from('mercado_livre_connections').update({encrypted_tokens:seal(JSON.stringify(tokens),key,`connection:${owner}:${tokens.user_id}`),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),status:'active',version:randomUUID(),lock_id:null,refresh_started_at:null,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('version',version).eq('lock_id',lock).eq('status','refreshing').select('owner_id').maybeSingle();check(error);return !!data;},
  async fail(owner,version,lock,status){const {error}=await db.from('mercado_livre_connections').update({status,lock_id:null,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('version',version).eq('lock_id',lock).eq('status','refreshing');check(error);},
 };
}
export async function oauthAccessToken(owner:string){requireOAuthAdmin(owner);const config=oauthConfig();return activeAccessToken(owner,tokenStore(),config.key,{id:config.id,secret:config.secret});}
export async function oauthStatus(owner:string){
 requireOAuthAdmin(owner);const config=oauthConfig(),db=vault();
 const {data,error}=await db.from('mercado_livre_connections').select('status,expires_at,refresh_started_at').eq('owner_id',owner).maybeSingle();check(error);
 return {configured:true,connected:data?.status==='active',status:data?.status||'not_connected',expiresAt:data?.expires_at||null,redirectUri:config.redirect};
}
export function oauthError(error:unknown){
 const known=error instanceof OAuthFailure,code=known?error.code:'server_error';return Response.json({error:known?error.message:'Não foi possível concluir o OAuth. Nenhum token foi exibido.',code},{status:code==='forbidden'?403:code==='configuration'||code==='vault'?503:400,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
