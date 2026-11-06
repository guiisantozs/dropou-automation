import {providerDiagnostic,providerFailure} from './provider-diagnostic';
export async function checkModel(model:string,key:string|undefined,http:typeof fetch=fetch){
 if(!key)return {available:false,message:'Chave OpenAI ausente no backend.'};
 try{const response=await http('https://api.openai.com/v1/models/'+encodeURIComponent(model),{method:'GET',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok){const body=await response.json().catch(()=>null),diagnostic=providerDiagnostic(response.status,body?.error,response.headers.get('x-request-id'));return {available:false,diagnostic,message:response.status===429?'Consulta limitada pela OpenAI. Aguarde antes de repetir.':providerFailure(diagnostic).message};}
  const data=await response.json();return {available:data.id===model,message:data.id===model?'Modelo acessível nesta conta. Esta consulta não gera texto ou analisa imagens; quota e execução visual só são comprovadas no teste autorizado.':'A resposta não confirmou o modelo configurado.'};
 }catch{return {available:false,message:'A consulta ao modelo não respondeu. Nenhuma geração foi solicitada.'};}
}
