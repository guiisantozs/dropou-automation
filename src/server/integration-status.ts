import 'server-only';
import {SupabaseClient} from '@supabase/supabase-js';
import {IntegrationStatus} from '@/lib/integration-status';
import {oauthAccessToken,oauthConfig,oauthStatus,requireOAuthAdmin} from './mercado-livre/oauth';
import {OAuthFailure,redirectUri} from './mercado-livre/oauth-core';
import {probeMercadoLivre} from './mercado-livre/probe';
const event='Teste de integrações';
export async function integrationStatus(db:SupabaseClient,owner:string,run=false):Promise<IntegrationStatus>{
 requireOAuthAdmin(owner);
 const checkedAt=new Date().toISOString();
 const configuration=Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','MERCADO_LIVRE_CLIENT_ID','MERCADO_LIVRE_CLIENT_SECRET','MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY','MERCADO_LIVRE_ADMIN_USER_IDS','APP_BASE_URL','MERCADO_LIVRE_REDIRECT_URI'].map(k=>[k,!!process.env[k]]));
 const result:IntegrationStatus={supabase:{state:'pending',message:'Não testado.',checkedAt:null},mercadoLivre:{oauth:{state:'pending',message:'Autorize sua conta pelo botão Conectar Mercado Livre.',checkedAt:null},search:{state:'pending',message:'Não testada. OAuth não garante permissão de busca.',checkedAt:null}},shopee:{state:'pending',message:'Aguardando credenciais, aprovação e documentação oficial da conta.',checkedAt:null},telegram:{state:'pending',message:process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID?'Configuração presente; conexão não testada.':'Aguardando configuração.',checkedAt:null},configuration,redirectUri:null};
 async function finish(){if(run){const {error}=await db.from('logs').insert({owner_id:owner,event,detail:JSON.stringify({version:1,...result.mercadoLivre,supabase:result.supabase,configuration:result.configuration})});if(error)result.supabase={state:'error',message:'Leitura executada, mas o banco recusou salvar o resultado do teste.',code:error.code,checkedAt};}return result;}
 try{result.redirectUri=redirectUri(process.env.APP_BASE_URL||'');}catch{}
 const {error:readError}=await db.from('products').select('id',{count:'exact',head:true}).eq('owner_id',owner);
 result.supabase=readError?{state:'error',message:`Falha na leitura autenticada: ${readError.message.slice(0,250)}`,code:readError.code,checkedAt}:{state:'connected',message:'Leitura autenticada de produtos confirmada neste servidor. Testes de escrita e RLS documentados separadamente.',checkedAt};
 try{
  oauthConfig();const status=await oauthStatus(owner);
  if(status.status==='not_connected')return finish();
  if(status.status!=='active'){result.mercadoLivre.oauth={state:status.status==='refreshing'?'pending':'error',message:status.status==='refreshing'?'Renovação em andamento. Se persistir, refaça a conexão.':'A conexão exige nova autorização. Use Conectar Mercado Livre.',code:status.status,checkedAt};return finish();}
  if(!run){
   const {data}=await db.from('logs').select('detail').eq('owner_id',owner).eq('event',event).order('created_at',{ascending:false}).limit(1).maybeSingle();
   if(data){try{const previous=JSON.parse(data.detail);if(previous.version===1&&previous.oauth?.checkedAt&&Date.now()-Date.parse(previous.oauth.checkedAt)<15*60000)result.mercadoLivre={oauth:previous.oauth,search:previous.search,account:previous.account};}catch{}}
   if(result.mercadoLivre.oauth.state==='pending')result.mercadoLivre.oauth.message='Autorização armazenada; clique em Testar integrações para validar o acesso atual.';
   return finish();
  }
  const token=await oauthAccessToken(owner);
  if(token)result.mercadoLivre=await probeMercadoLivre(token,[process.env.MERCADO_LIVRE_CLIENT_SECRET||'']);
 }catch(e){result.mercadoLivre.oauth={state:e instanceof OAuthFailure&&e.code==='configuration'?'pending':'error',message:e instanceof OAuthFailure?e.message:'Não foi possível validar a conexão segura do Mercado Livre.',code:e instanceof OAuthFailure?e.code:'server_error',checkedAt};}
 return finish();
}
