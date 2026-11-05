import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/server/db';
import { adapters } from '@/server/adapters';
import { sendTelegram } from '@/server/telegram';
import { caption, canonical, cleanCandidates, defaultSchedule, publicationError, productSchema, scheduleSlot, Schedule } from '@/lib/domain';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET, received=request.headers.get('authorization')||'';
  if(!secret || Buffer.byteLength(received)!==Buffer.byteLength(`Bearer ${secret}`) || !timingSafeEqual(Buffer.from(received),Buffer.from(`Bearer ${secret}`))) return Response.json({error:'Não autorizado'},{status:401});
  if(process.env.ENABLE_AUTOMATIONS!=='true')return Response.json({error:'Automação pausada. Use o fluxo manual de ofertas.'},{status:503});
  try {
    const db=adminDb();
    const {data:settings,error}=await db.from('settings').select('*'); if(error)throw error;
    let executed=0;
    for(const setting of settings||[]){
      const config={...defaultSchedule,...setting.schedule} as Schedule;
      const slot=scheduleSlot(config); if(!slot)continue;
      const {error:claim}=await db.from('runs').insert({owner_id:setting.owner_id,slot});
      if(claim?.code==='23505')continue; if(claim)throw claim;
      // One run per owner/slot. Failures are retained for review, never blindly replayed.
      const log=async(event:string,detail:string)=>{const {error}=await db.from('logs').insert({owner_id:setting.owner_id,event,detail});if(error)throw error;};
      for(const [store,adapter] of Object.entries(adapters)){
        try{
          const found=cleanCandidates(await adapter.search(['tecnologia','games']));
          for(const p of found){
            const {error}=await db.from('products').upsert({id:p.id,owner_id:setting.owner_id,data:p,canonical_url:canonical(p.originalUrl)},{onConflict:'owner_id,canonical_url',ignoreDuplicates:true});
            if(error)throw error;
          }
        }catch{await log('integração pendente',`${store}: busca oficial não configurada ou indisponível`);}
      }
      const {data:rows,error:readError}=await db.from('products').select('*').eq('owner_id',setting.owner_id);if(readError)throw readError;
      for(const row of rows||[]){
        const parsed=productSchema.safeParse(row.data);
        if(!parsed.success || parsed.data.id!==row.id){await log('dados inválidos',`Registro ${row.id} ignorado`);continue;}
        const p=parsed.data;
        if(p.status!=='agendado'||!p.scheduledAt||Date.parse(p.scheduledAt)>Date.now()||p.demo)continue;
        try{
          const fresh=productSchema.parse(await adapters[p.store].revalidate(p));
          if(fresh.id!==p.id||fresh.store!==p.store||canonical(fresh.originalUrl)!==canonical(p.originalUrl))throw new Error('Resposta de outro produto');
          if(!fresh.inStock||fresh.price!==p.price||publicationError(fresh)){
            const {error:withdrawError}=await db.from('products').update({data:{...fresh,status:'encontrado',scheduledAt:null}}).eq('id',p.id).eq('owner_id',setting.owner_id);if(withdrawError)throw withdrawError;
            await log('oferta retirada da fila',`${p.id}: preço/estoque mudou ou validação expirou`);continue;
          }
          if(!config.telegram)continue;
          const {error:locked}=await db.from('deliveries').insert({owner_id:setting.owner_id,product_id:p.id,channel:'telegram',state:'sending'});
          if(locked?.code==='23505')continue;if(locked)throw locked;
          // On timeout keep 'sending': delivery may have occurred. No automatic retry.
          const messageId=await sendTelegram(caption(fresh));
          const {error:deliveryError}=await db.from('deliveries').update({state:'sent',message_id:messageId}).eq('product_id',p.id).eq('channel','telegram').eq('owner_id',setting.owner_id);if(deliveryError)throw deliveryError;
          const {error:saveError}=await db.from('products').update({data:{...fresh,status:'publicado'}}).eq('id',p.id).eq('owner_id',setting.owner_id);if(saveError)throw saveError;
          await log('publicado',`${p.id}: Telegram ${messageId}`);
        }catch{await log('publicação bloqueada',`${p.id}: revalidação ou envio indisponível; revisar antes de repetir`);}
      }
      executed++;
    }
    return Response.json({executed});
  }catch{return Response.json({error:'Falha no agendador; consulte logs do servidor sem expor credenciais'},{status:500});}
}
