import {sessionDb,apiError} from '@/server/session';
import {importMercadoLivre} from '@/server/mercado-livre/import';
import {z} from 'zod';
import {publicationAdmin} from '@/server/telegram-offer';
import {lookupSavedShopeeProduct} from '@/server/shopee/saved-products';
import {isShopeeOperation} from '@/lib/workspace-brands';
export async function POST(request:Request){try{
 const {db:session,user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {store,url}=z.object({store:z.enum(['Mercado Livre','Shopee']),url:z.string().url()}).parse(await request.json());
 if(store==='Shopee'){
  if(!isShopeeOperation(operation))throw new Error('Selecione um canal Dropou com importação Shopee.');
  const {db}=await publicationAdmin(user.id);return Response.json({product:await lookupSavedShopeeProduct(db,user.id,url,operation)});
 }
 const {db}=await publicationAdmin(user.id);
 return Response.json(await importMercadoLivre(session,db,user.id,operation,url),{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
