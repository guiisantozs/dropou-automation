import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {affiliateStore} from '@/lib/affiliate';
import {adapters} from '@/server/adapters';
import {publicationAdmin} from '@/server/telegram-offer';
import {lookupSavedShopeeProduct} from '@/server/shopee/saved-products';
import {isShopeeOperation} from '@/lib/workspace-brands';
export async function POST(request:Request){try{
 const {user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {url}=z.object({url:z.string().url().max(4096)}).parse(await request.json());
 const store=affiliateStore(url);
 if(store==='Shopee'){
  if(!isShopeeOperation(operation))throw new Error('Selecione um canal Dropou com importação Shopee.');
  const {db}=await publicationAdmin(user.id),product=await lookupSavedShopeeProduct(db,user.id,url,operation);
  return Response.json({store,product,needsScreenshot:false,message:'Dados oficiais recebidos. Confira os dados da variante antes de salvar.'});
 }
 // These endpoints previously returned 403: only explicitly approved lookup is enabled.
 // Short affiliate links are preserved verbatim and never followed or scraped.
 if(store==='Mercado Livre'&&process.env.MERCADO_LIVRE_LOOKUP_APPROVED==='true'&&new URL(url).hostname!=='meli.la'){
  try{const product=await adapters[store].lookup(url,user.id);return Response.json({store,product:{...product,operation,affiliateUrl:url,dataOrigin:'official'},needsScreenshot:false});}catch{/* One authorized attempt. No retries, alternate endpoints or scraping. */}
 }
 return Response.json({store,needsScreenshot:true,message:'Consulta autorizada indisponível para este link. Adicione um print; o OCR será executado no seu navegador.'});
}catch(e){return apiError(e);}}
