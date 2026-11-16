import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {celularesConfigSchema} from '@/lib/celulares-curation';
import {operatorAudit} from '@/server/operator-audit';
export async function GET(request:Request){try{
 const {db,user,operation,access}=await sessionDb(request);if(operation!=='celulares')throw new Error('Selecione Celulares & Gadgets.');
 const settings=await db.from('operation_settings').select('celulares_curation,discovery_daily_limit').eq('owner_id',user.id).eq('brand_id',operation).single();if(settings.error)throw dbError(settings.error);
 return Response.json({config:celularesConfigSchema.parse(settings.data.celulares_curation),admin:access.admin,dailyLimit:settings.data.discovery_daily_limit},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,operation,access,actorId}=await sessionDb(request);if(operation!=='celulares'||!access.admin)throw new Error('FORBIDDEN: Somente administradores configuram a curadoria de Celulares.');
 const config=celularesConfigSchema.parse(await request.json()),{db}=await publicationAdmin(user.id);
 const changed=await db.from('operation_settings').update({celulares_curation:config,updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('brand_id',operation);if(changed.error)throw dbError(changed.error);
 await operatorAudit(user.id,actorId,operation,'Critérios da curadoria de Celulares alterados');return Response.json({config});
}catch(e){return apiError(e);}}
