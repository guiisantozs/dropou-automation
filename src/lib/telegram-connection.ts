import {z} from 'zod';
import {operationSchema} from './workspace-brands';
import {operationSupports} from './operation-capabilities';

export const telegramConnectionSchema=z.object({brand:operationSchema,action:z.enum(['verify','test']).default('verify'),targetKey:z.string().length(64).optional(),confirmation:z.literal('ENVIAR TESTE').optional(),requestId:z.uuid().optional()}).superRefine((v,ctx)=>{
 if(v.action==='test'&&(v.confirmation!=='ENVIAR TESTE'||!v.requestId||!operationSupports(v.brand,'automaticPublishing')&&!v.targetKey))ctx.addIssue({code:'custom',message:'Confirme explicitamente o envio do teste ao canal salvo após verificar a conexão.'});
});
