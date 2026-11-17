import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {batchPrepareSchema,batchCommitSchema} from '@/lib/bulk-scheduling';
import {prepareScheduleBatch,confirmScheduleBatch} from '@/server/bulk-scheduling';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(request:Request){try{
 const {db,access}=await sessionDb(request),params=new URL(request.url).searchParams;
 const q=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(180).default(''),status:z.enum(['all','unreviewed','published','unpublished']).default('all'),channel:z.enum(['telegram','whatsapp']).default('telegram')}).parse(Object.fromEntries(params));
 const r=await db.rpc('dropou_schedule_candidates',{p_page:q.page,p_q:q.q,p_status:q.status,p_channel:q.channel});if(r.error)throw dbError(r.error);
 return Response.json({...r.data,operations:access.brands},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const {db,user,actorId,operation,access}=await sessionDb(request),input=await request.json(),ctx={db,owner:user.id,actor:actorId,operation,brands:access.brands};
 if(input.action==='prepare')return Response.json(await prepareScheduleBatch(ctx,batchPrepareSchema.parse(input)));
 const body=batchCommitSchema.parse(input);return Response.json(await confirmScheduleBatch(ctx,body.id));
}catch(e){return apiError(e);}}
