import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
import {captionError} from '@/lib/caption-editor';
import {productSchema} from '@/lib/domain';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request);const id=z.string().uuid().parse((await context.params).id);
 const row=await db.from('offers').select('caption,snapshot').eq('id',id).eq('owner_id',user.id).single();if(row.error)throw dbError(row.error);
 const issue=captionError(row.data.caption,productSchema.parse(row.data.snapshot));if(issue)throw new Error(issue);
 const {data,error}=await db.rpc('dropou_publish_offer',{p_offer:id});if(error)throw dbError(error);
 return Response.json({publication:data});
}catch(e){return apiError(e);}}
