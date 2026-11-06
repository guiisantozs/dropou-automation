export async function checkModel(model:string,key:string|undefined,http:typeof fetch=fetch){
 if(!key)return {available:false,message:'Chave OpenAI ausente no backend.'};
 try{const response=await http('https://api.openai.com/v1/models/'+encodeURIComponent(model),{method:'GET',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)return {available:false,message:response.status===401?'A OpenAI recusou a chave configurada.':response.status===403||response.status===404?'O modelo não está acessível com esta chave ou permissão.':response.status===429?'Consulta limitada pela OpenAI. Aguarde antes de repetir.':'Não foi possível consultar o modelo agora.'};
  const data=await response.json();return {available:data.id===model,message:data.id===model?'Modelo acessível nesta conta. Esta consulta não gera texto ou analisa imagens; quota e execução visual só são comprovadas no teste autorizado.':'A resposta não confirmou o modelo configurado.'};
 }catch{return {available:false,message:'A consulta ao modelo não respondeu. Nenhuma geração foi solicitada.'};}
}
