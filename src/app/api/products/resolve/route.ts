import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {affiliateStore} from '@/lib/affiliate';
import {adapters} from '@/server/adapters';
export async function POST(request:Request){try{
 const {user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {url}=z.object({url:z.string().url().max(4096)}).parse(await request.json());
 const store=affiliateStore(url);
 // These endpoints previously returned 403: only explicitly approved lookup is enabled.
 // Short affiliate links are preserved verbatim and never followed or scraped.
 if(store==='Mercado Livre'&&process.env.MERCADO_LIVRE_LOOKUP_APPROVED==='true'&&new URL(url).hostname!=='meli.la'){
  try{const product=await adapters[store].lookup(url,user.id);return Response.json({store,product:{...product,operation,affiliateUrl:url,dataOrigin:'official'},needsScreenshot:false});}catch{/* One authorized attempt. No retries, alternate endpoints or scraping. */}
 }
 return Response.json({store,needsScreenshot:true,message:'Consulta autorizada indisponível para este link. Adicione um print; o OCR será executado no seu navegador.'});
}catch(e){return apiError(e);}}
