import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {affiliateStore} from '@/lib/affiliate';
import {importMercadoLivre} from '@/server/mercado-livre/import';
import {publicationAdmin} from '@/server/telegram-offer';
import {lookupSavedShopeeProduct} from '@/server/shopee/saved-products';
import {isShopeeOperation} from '@/lib/workspace-brands';
export async function POST(request:Request){try{
 const {db:session,user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {url}=z.object({url:z.string().url().max(4096)}).parse(await request.json());
 const store=affiliateStore(url);
 if(store==='Shopee'){
  if(!isShopeeOperation(operation))throw new Error('Selecione um canal Dropou com importação Shopee.');
  const {db}=await publicationAdmin(user.id),product=await lookupSavedShopeeProduct(db,user.id,url,operation);
  return Response.json({store,product,needsScreenshot:false,message:'Dados oficiais recebidos. Confira os dados da variante antes de salvar.'});
 }
 const {db}=await publicationAdmin(user.id);
 return Response.json(await importMercadoLivre(session,db,user.id,operation,url),{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
