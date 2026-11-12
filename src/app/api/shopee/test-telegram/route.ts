import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {resolveTelegramTarget,sendTelegramTo,TelegramFailure} from '@/server/telegram-core';
import {shopeeCaption,shopeeConfigSchema,assessShopeeOffer} from '@/lib/shopee-automation';
export const runtime='nodejs';
async function context(request:Request){
 const {user,operation}=await sessionDb(request);if(operation!=='dropou')throw new Error('Selecione Dropou.');const {db}=await publicationAdmin(user.id);
 const test=process.env.TELEGRAM_TEST_CHAT_ID;
 if(process.env.SHOPEE_TELEGRAM_TEST_ENABLED!=='true'||!test||!/^-[1-9]\d+$/.test(test))throw new Error('Configure e libere um canal de teste separado, por ID numérico, no servidor.');
 const destinations=await db.from('operation_settings').select('telegram_chat_id').eq('owner_id',user.id);if(destinations.error)throw new Error('Configuração indisponível.');
 const env={...process.env,TELEGRAM_CHAT_ID:test,TELEGRAM_CHANNEL_ID:test},target=await resolveTelegramTarget(env);
 if([...destinations.data.map(s=>s.telegram_chat_id),process.env.TELEGRAM_CHAT_ID,process.env.TELEGRAM_CHANNEL_ID].includes(target.id))throw new Error('O canal de teste deve ser diferente dos destinos de produção.');
 return {db,user,env,target};
}
export async function GET(request:Request){try{const {target}=await context(request);return Response.json({target},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const {db,user,env,target}=await context(request),body=z.object({id:z.string().uuid(),requestId:z.string().uuid(),targetKey:z.string().length(64),confirmation:z.literal('ENVIAR SOMENTE NO CANAL DE TESTE')}).parse(await request.json());
 if(body.targetKey!==target.key)throw new Error('O canal de teste mudou. Confira novamente.');
 const offer=await db.from('shopee_offers').select('data,eligible').eq('id',body.id).eq('owner_id',user.id).eq('brand_id','dropou').single();if(offer.error||!offer.data?.eligible)throw new Error('Selecione uma oferta elegível.');
 const settings=await db.from('operation_settings').select('shopee_config').eq('owner_id',user.id).eq('brand_id','dropou').single();if(settings.error||!settings.data||!assessShopeeOffer(offer.data.data,shopeeConfigSchema.parse(settings.data.shopee_config)).eligible)throw new Error('A oferta não atende aos critérios atuais.');
 // Reserve before the network call. Unknown outcomes never retry automatically.
 const reservation=await db.from('runs').insert({owner_id:user.id,slot:'shopee-telegram-test:'+body.requestId});if(reservation.error)throw new Error('Teste já reservado ou banco indisponível. Confira o canal antes de repetir.');
 let ids:string[]=[];let state='uncertain';
 try{ids=await sendTelegramTo(env,target,'🧪 TESTE DROPOU\n\n'+shopeeCaption(offer.data.data),offer.data.data.image,fetch,async received=>{ids=received;},async()=>{},{mediaMode:'photo'});state='sent';}
 catch(e){if(e instanceof TelegramFailure){ids=e.ids;state=e.outcome;}}
 const saved=await db.from('logs').insert({owner_id:user.id,brand_id:'dropou',event:'Teste Telegram Shopee',detail:JSON.stringify({requestId:body.requestId,offer:body.id,destination:target.id,messageIds:ids,state})});if(saved.error)throw new Error('Recibo de teste pendente. Confira o canal antes de repetir.');
 return Response.json({state,messageIds:ids,destination:target.title});
 }catch(e){return apiError(e);}}
