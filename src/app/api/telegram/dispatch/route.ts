export {POST} from '../../cron/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Read-only server diagnosis. The existing dispatcher secret stays inside the backend and pg_net.
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/server/db';
import {telegramTarget} from '@/server/telegram';
export async function GET(request:Request){
 const received=request.headers.get('authorization')||'';if(!received.startsWith('Bearer ')||received.length<20)return Response.json({error:'Não autorizado'},{status:401});
 try{
  const config=await adminDb().from('telegram_dispatch_config').select('secret,automation_enabled').eq('id',true).single(),expected='Bearer '+config.data?.secret;
  if(config.error||Buffer.byteLength(expected)!==Buffer.byteLength(received)||!timingSafeEqual(Buffer.from(expected),Buffer.from(received)))return Response.json({error:'Não autorizado'},{status:401});
  return Response.json({telegram:await telegramTarget(),paused:!config.data.automation_enabled},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:(e as Error).message},{status:503,headers:{'Cache-Control':'no-store'}});}
}
