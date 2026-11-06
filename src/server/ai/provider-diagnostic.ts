export type ProviderDiagnostic={status:number;code:string;param?:string;requestId?:string};
const codes=new Set(['invalid_api_key','model_not_found','insufficient_quota','billing_hard_limit_reached','rate_limit_exceeded','unsupported_value','unsupported_parameter','invalid_json_schema','invalid_image','invalid_image_format','invalid_image_url','image_too_large','context_length_exceeded','invalid_request_error','permission_denied']);
// Only known metadata is exposed; provider messages may contain secrets or image URLs.
export function providerDiagnostic(status:number,error:unknown,requestId:string|null):ProviderDiagnostic{
 const value=error&&typeof error==='object'?error as {code?:unknown;param?:unknown}:{};
 const code=typeof value.code==='string'&&codes.has(value.code)?value.code:'http_error';
 const param=typeof value.param==='string'&&/^(?:model|max_output_tokens|store|reasoning(?:\.effort)?|text(?:\.format(?:\.(?:schema|type|name|strict))?)?|input(?:\[\d+\])?(?:\.content(?:\[\d+\])?(?:\.(?:type|image_url|detail|text))?)?)$/.test(value.param)?value.param:undefined;
 return {status,code,...(param?{param}:{}),...(requestId&&/^req_[A-Za-z0-9_-]{1,100}$/.test(requestId)?{requestId}:{})};
}
export function providerFailure(diagnostic:ProviderDiagnostic){
 const {status,code,param}=diagnostic;
 const detail=` HTTP ${status}${code!=='http_error'?' · '+code:''}${param?' · campo '+param:''}.`;
 if(status===401)return {kind:'authentication',message:'A OpenAI recusou a chave configurada na Vercel. Confira a chave e o projeto da API.'+detail};
 if(status===404||code==='model_not_found')return {kind:'model_access',message:'O modelo configurado não está disponível para esta chave. Use Verificar acesso ao modelo (sem gerar).'+detail};
 if(status===403)return {kind:'permission',message:'A OpenAI negou a permissão desta chave ou projeto. Confira as permissões para o modelo e Responses API.'+detail};
 if(status===400||status===422)return {kind:'invalid_request',message:'A OpenAI rejeitou o formato da solicitação. O OCR foi usado como alternativa; este erro precisa ser corrigido na integração.'+detail};
 return {kind:'unavailable',message:'A OpenAI não atendeu à solicitação. O OCR gratuito está disponível.'+detail};
}
