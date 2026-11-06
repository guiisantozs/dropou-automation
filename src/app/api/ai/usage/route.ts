import {z} from 'zod';
import {aiError,aiSession} from '@/server/ai/service';
import {adminDb} from '@/server/db';
import {dbError} from '@/server/session';
export async function GET(request:Request){try{
 await aiSession(request);const {data,error}=await adminDb().rpc('dropou_economy_ai_usage');if(error)throw dbError(error);
 const visual=await adminDb().rpc('dropou_economy_visual_usage');
 return Response.json({...data,visual:visual.error?null:visual.data,model:process.env.OPENAI_MODEL||'gpt-6-luna',configured:!!process.env.OPENAI_API_KEY,enabled:process.env.OPENAI_ENABLED==='true'});
}catch(e){return aiError(e);}}
export async function PATCH(request:Request){try{
 await aiSession(request);const body=z.object({enabled:z.boolean(),total_limit:z.number().min(0).max(1000),daily_limit:z.number().min(0).max(100),daily_requests:z.number().int().min(0).max(10000)}).parse(await request.json());
 const {error}=await adminDb().from('ai_budget').update(body).eq('id',1);if(error)throw dbError(error);return Response.json({ok:true});
}catch(e){return aiError(e);}}
