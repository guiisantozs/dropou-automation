import 'server-only';
import {adminDb} from '../db';
import {apiError,dbError,sessionDb} from '../session';
import {AIStore,generate,modelConfig} from './core';
import {generationSchema} from '@/lib/ai';
import {productSchema} from '@/lib/domain';
import {assertAIAdmin} from '@/lib/ai-admin';
export async function aiSession(request:Request){const session=await sessionDb(request);assertAIAdmin(session.user.id);return session;}
export function aiError(error:unknown){if(error instanceof Error&&error.message.startsWith('FORBIDDEN:'))return Response.json({error:error.message.slice(11)},{status:403});return apiError(error);}
export function aiStore(owner:string):AIStore{
 const db=adminDb();
 return {async reserve(entries,model,maxCost,rates){const {data,error}=await db.rpc('dropou_economy_ai_reserve',{p_owner:owner,p_entries:entries,p_model:model,p_max_cost:maxCost,p_rates:rates||{}});if(error)throw dbError(error);return data;},async finish(id,result){const {error}=await db.rpc('dropou_economy_ai_finish',{p_id:id,p_result:result});if(error)throw dbError(error);}};
}
export async function generateForRequest(request:Request){
 const {db,user}=await aiSession(request),body=generationSchema.parse(await request.json());
 const ids=[...new Set(body.productIds)];
 const {data,error}=await db.from('products').select('id,data').eq('owner_id',user.id).in('id',ids);
 if(error)throw dbError(error);
 if(data.length!==ids.length)throw new Error('Produto não encontrado neste workspace.');
 const products=data.map(row=>productSchema.parse(row.data));
 const results=await generate(products,body.brand,body.variants,aiStore(user.id),{...modelConfig(),key:process.env.OPENAI_API_KEY,enabled:process.env.OPENAI_ENABLED==='true'});
 return Response.json({results});
}
