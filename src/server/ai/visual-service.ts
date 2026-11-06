import 'server-only';
import {adminDb} from '../db';
import {dbError} from '../session';
import {VISUAL_VERSION} from '@/lib/visual';
import {VisualStore} from './visual-core';
export function visualStore(owner:string):VisualStore{
 const db=adminDb();
 return {async reserve(key,hashes,model,brand,maxCost,rates){const {data,error}=await db.rpc('dropou_economy_visual_reserve',{p_owner:owner,p_key:key,p_hashes:hashes,p_model:model,p_brand:brand,p_prompt:VISUAL_VERSION,p_max_cost:maxCost,p_rates:rates});if(error)throw dbError(error);return data;},async finish(id,result,payload){const {error}=await db.rpc('dropou_economy_visual_finish',{p_id:id,p_result:result,p_payload:payload});if(error)throw dbError(error);}};
}
