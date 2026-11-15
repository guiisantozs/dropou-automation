export type SearchFeedback={message:string;errors?:string[];status?:'complete'|'partial'|'failed';retryAt?:string};
export function shopeeSearchFeedback(result:SearchFeedback){
 const retry=result.retryAt&&Number.isFinite(Date.parse(result.retryAt))?' Aguarde até '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(result.retryAt))+' antes de tentar novamente.':'';
 return {failed:result.status==='failed',message:[result.message,...result.errors||[]].filter(Boolean).join(' ')+retry};
}
