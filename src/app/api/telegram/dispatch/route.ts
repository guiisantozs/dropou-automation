export {POST} from '../../cron/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Read-only server diagnosis. The existing dispatcher secret stays inside the backend and pg_net.
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/server/db';
import {telegramTarget} from '@/server/telegram';
import {operationSchema} from '@/lib/workspace-brands';
export async function GET(request:Request){
 const received=request.headers.get('authorization')||'';if(!received.startsWith('Bearer ')||received.length<20)return Response.json({error:'Não autorizado'},{status:401});
 try{
  const config=await adminDb().from('telegram_dispatch_config').select('secret,automation_enabled,owner_ids').eq('id',true).single(),expected='Bearer '+config.data?.secret;
  if(config.error||Buffer.byteLength(expected)!==Buffer.byteLength(received)||!timingSafeEqual(Buffer.from(expected),Buffer.from(received)))return Response.json({error:'Não autorizado'},{status:401});
  const requested=new URL(request.url).searchParams.get('brand');
  if(requested){const brand=operationSchema.parse(requested);if(config.data.owner_ids.length!==1)throw new Error('Diagnóstico por canal exige um único workspace configurado.');return Response.json({telegram:await telegramTarget(config.data.owner_ids[0],brand,true),brand,paused:!config.data.automation_enabled},{headers:{'Cache-Control':'no-store'}});}
  return Response.json({telegram:await telegramTarget(),paused:!config.data.automation_enabled},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:(e as Error).message},{status:503,headers:{'Cache-Control':'no-store'}});}
}
