import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {extensionOperation,extensionImportSchema} from '@/lib/mercado-livre-extension';
import {receiveExtension,prepareExtension} from '@/server/mercado-livre/extension';
function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)throw new Error('FORBIDDEN: Abra a plataforma para receber o produto.');}
export async function GET(request:Request){try{
 const {db,user,operation}=await sessionDb(request),brand=extensionOperation(operation);
 const rows=await db.from('ml_extension_inbox').select('*').eq('owner_id',user.id).eq('brand_id',brand).eq('state','pending').order('created_at',{ascending:false}).limit(20);if(rows.error)throw dbError(rows.error);
 return Response.json({rows:rows.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const {db,user,actorId,operation}=await sessionDb(request),brand=extensionOperation(operation);sameOrigin(request);
 if(Number(request.headers.get('content-length')||0)>16000)throw new Error('Solicitação muito grande.');
 const body=await request.text();if(body.length>16000)throw new Error('Solicitação muito grande.');const raw=JSON.parse(body);
 const {db:admin}=await publicationAdmin(user.id);
 const result=raw.action==='prepare'?await prepareExtension(db,admin,user.id,actorId,brand,raw.review):await receiveExtension(db,admin,user.id,actorId,brand,extensionImportSchema.parse(raw));
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
