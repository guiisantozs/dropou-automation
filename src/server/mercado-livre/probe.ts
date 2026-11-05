import {MarketplaceChecks,Check} from '../../lib/integration-status';
// Read-only official probes, independent of the discovery enable flag.
// A successful search does not prove prices, affiliate capability or permission to publish.
export async function probeMercadoLivre(token:string,secretValues:string[]=[],http:typeof fetch=fetch):Promise<MarketplaceChecks>{
 const checkedAt=new Date().toISOString(),secrets=[token,...secretValues].filter(Boolean);
 function safe(input:unknown){let s=typeof input==='string'?input:'Resposta sem descrição de erro.';for(const value of secrets)s=s.split(value).join('[redigido]');return s.replace(/Bearer\s+\S+|APP_USR-[\w-]+|TG-[\w-]+|eyJ[\w.-]+/gi,'[redigido]').slice(0,400);}
 async function request(path:string):Promise<{check:Check;data?:Record<string,unknown>}>{
  try{
   const r=await http('https://api.mercadolibre.com'+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
   const data=await r.json().catch(()=>null);
   if(!r.ok)return {check:{state:'unavailable',message:safe(data?.error_description||data?.message||`API oficial retornou HTTP ${r.status}.`),code:safe(data?.error||'http_error'),httpStatus:r.status,checkedAt}};
   if(!data||typeof data!=='object')return {check:{state:'error',message:'API oficial retornou uma resposta inválida.',httpStatus:r.status,code:'invalid_response',checkedAt}};
   return {check:{state:'connected',message:'Chamada autenticada confirmada.',httpStatus:r.status,checkedAt},data};
  }catch{return {check:{state:'error',message:'Falha de conexão ou timeout na API oficial. Nenhuma alternativa não autorizada foi utilizada.',code:'network_error',checkedAt}};}
 }
 const me=await request('/users/me');
 if(me.check.state!=='connected')return {oauth:me.check,search:{state:'pending',message:'Busca não testada: a chamada autenticada da conta falhou.',checkedAt:null}};
 if(!me.data?.id||typeof me.data.nickname!=='string')return {oauth:{state:'error',message:'Dados básicos da conta incompatíveis com a resposta esperada.',code:'invalid_account',checkedAt},search:{state:'pending',message:'Busca não testada.',checkedAt:null}};
 const search=await request('/sites/MLB/search?category=MLB1648&limit=5');
 if(search.check.state==='connected')search.check=Array.isArray(search.data?.results)?{...search.check,state:'available',message:`Busca oficial autorizada; ${search.data.results.length} resultado(s) nesta consulta de informática. Preços ainda precisam de verificação.`}:{...search.check,state:'error',message:'Resposta de busca incompatível: campo results ausente.',code:'invalid_response'};
 return {oauth:me.check,search:search.check,account:{id:String(me.data.id),nickname:me.data.nickname.slice(0,100)}};
}
