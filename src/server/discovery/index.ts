import 'server-only';
import {mercadoLivreClient} from './mercado-livre';
import {DiscoveryFilters,DiscoveryResult,SourceReport} from '@/lib/discovery';
import {oauthAccessToken,requireOAuthAdmin} from '../mercado-livre/oauth';
import {OAuthFailure} from '../mercado-livre/oauth-core';
export const meli=()=>mercadoLivreClient({token:process.env.MERCADO_LIVRE_ACCESS_TOKEN,approved:process.env.MERCADO_LIVRE_SEARCH_APPROVED==='true'});
export async function meliForUser(owner?:string){
 if(!owner)return mercadoLivreClient({approved:false});
 // OAuth e token legado são restritos ao administrador explicitamente permitido.
 requireOAuthAdmin(owner);
 let token:string|null=null;
 if(process.env.MERCADO_LIVRE_CLIENT_ID&&process.env.MERCADO_LIVRE_CLIENT_SECRET&&process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY))token=await oauthAccessToken(owner);
 return mercadoLivreClient({token:token||process.env.MERCADO_LIVRE_ACCESS_TOKEN,approved:process.env.MERCADO_LIVRE_SEARCH_APPROVED==='true'});
}
export function shopeePending():SourceReport{return {store:'Shopee',state:'pending',message:'Integração pendente: aprovação da Affiliate Open API brasileira, App ID, Secret e documentação oficial da conta para consulta e geração de links.',found:0,discarded:0,errors:[],checkedAt:new Date().toISOString()};}
export async function discover(filters:DiscoveryFilters,owner?:string):Promise<DiscoveryResult>{
 const products:DiscoveryResult['products']=[],sources:SourceReport[]=[];
 if(filters.store!=='Shopee'){try{const result=await (await meliForUser(owner)).search(filters);products.push(...result.products);sources.push(result.report);}catch(e){sources.push({store:'Mercado Livre',state:'pending',message:e instanceof OAuthFailure?e.message:'Não foi possível obter uma conexão segura com o Mercado Livre.',found:0,discarded:0,errors:[],checkedAt:new Date().toISOString()});}}
 if(filters.store!=='Mercado Livre')sources.push(shopeePending());
 return {products:products.slice(0,filters.limit),sources,requested:filters.limit,category:filters.category,searchedAt:new Date().toISOString()};
}
