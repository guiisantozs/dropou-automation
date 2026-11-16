import {operationSchema,type OperationScope} from './workspace-brands';
import {z} from 'zod';
export const memberInputSchema=z.object({email:z.email().transform(v=>v.trim().toLowerCase()),role:z.enum(['admin','operator']),brands:z.array(operationSchema).min(1).max(operationSchema.options.length),displayName:z.string().trim().min(1).max(80).optional()});
/** Display names never participate in authorization. Membership/RLS remain authoritative. */
export function firstName(value:unknown){return typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/g,'').split(/\s+/)[0].slice(0,40):'';}
export function greeting(name:string,now=new Date()){const hour=now.getHours();return (hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite')+(firstName(name)?', '+firstName(name):'')+'!';}
export function accessibleScope(current:OperationScope,brands:readonly string[],admin:boolean):OperationScope|undefined{if(current==='all'&&admin||current!=='all'&&brands.includes(current))return current;return operationSchema.options.find(id=>brands.includes(id));}
