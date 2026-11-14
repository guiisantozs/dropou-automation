import 'server-only';
import {adminDb} from './db';
import type {OperationScope} from '@/lib/workspace-brands';
export async function operatorAudit(owner:string,actor:string,brand:OperationScope,action:string,resource?:string){
 if(brand==='all')return;
 const result=await adminDb().from('operation_audit').insert({owner_id:owner,actor_id:actor,brand_id:brand,action,resource_id:resource||null});
 if(result.error)throw new Error('A ação foi processada, mas o registro do operador ficou pendente. Atualize o histórico antes de repetir.');
}
