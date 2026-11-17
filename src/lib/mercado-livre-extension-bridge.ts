import {z} from 'zod';
import {extensionProtocol,extensionImportSchema,extensionOperation,type ExtensionInbox} from './mercado-livre-extension';
import type {OperationScope} from './workspace-brands';
import type {api} from './api';
const envelope=z.object({protocol:z.literal(extensionProtocol),direction:z.literal('to-page'),id:z.string().uuid(),command:z.enum(['connect','receive']),connectionId:z.string().uuid().optional(),payload:z.unknown().optional()}).strict();
/** Lives only in the authenticated page. No login material is ever returned to the extension. */
export function createExtensionPageBridge(operation:OperationScope,request:typeof api,onRows:(rows:ExtensionInbox[])=>void,now=Date.now){
 let active=true,connection:{id:string;expiresAt:number}|undefined;const inFlight=new Map<string,Promise<ExtensionInbox>>();
 return {dispose(){active=false;connection=undefined;},async handle(raw:unknown){
  const message=envelope.parse(raw);extensionOperation(operation);
  if(message.command==='connect'){
   const data=await request<{rows:ExtensionInbox[]}>('/api/mercado-livre/extension');if(!active)throw new Error('A conta ou operação mudou. Reconecte.');
   connection={id:crypto.randomUUID(),expiresAt:now()+300000};onRows(data.rows);
   return {ok:true,connectionId:connection.id,operation,expiresAt:connection.expiresAt};
  }
  if(!active||!connection||message.connectionId!==connection.id||connection.expiresAt<=now())throw new Error('Conexão expirada ou operação alterada. Conecte novamente.');
  const input=extensionImportSchema.parse(message.payload),key=input.requestId;
  let pending=inFlight.get(key);
  if(!pending){pending=request<ExtensionInbox>('/api/mercado-livre/extension','POST',input);inFlight.set(key,pending);}
  let row:ExtensionInbox;try{row=await pending;}finally{inFlight.delete(key);}
  if(!active)throw new Error('A conta ou operação mudou. Reconecte e reenvie o mesmo item.');
  if(row.request_id!==input.requestId||row.original_url!==input.originalUrl||row.candidate_url!==input.candidateUrl||row.draft.operation!==operation)throw new Error('Recebimento divergente. Atualize a plataforma.');
  onRows([row]);return {ok:true,requestId:input.requestId,status:row.existing||row.state==='prepared'?'existing':'pending'};
 }};
}
