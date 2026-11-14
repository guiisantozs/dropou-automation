import {sessionDb,apiError} from '@/server/session';
import {adapters} from '@/server/adapters';
import {productSchema} from '@/lib/domain';
import {z} from 'zod';
import {publicationAdmin} from '@/server/telegram-offer';
import {lookupSavedShopeeProduct} from '@/server/shopee/saved-products';
import {isShopeeOperation} from '@/lib/workspace-brands';
export async function POST(request:Request){try{
 const {user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {store,url}=z.object({store:z.enum(['Mercado Livre','Shopee']),url:z.string().url()}).parse(await request.json());
 if(store==='Shopee'){
  if(!isShopeeOperation(operation))throw new Error('Selecione um canal Dropou com importação Shopee.');
  const {db}=await publicationAdmin(user.id);return Response.json({product:await lookupSavedShopeeProduct(db,user.id,url,operation)});
 }
 if(store==='Mercado Livre'&&process.env.MERCADO_LIVRE_LOOKUP_APPROVED!=='true')throw new Error('Consulta bloqueada após HTTP 403. Use um print até obter autorização explícita para atualização de preços.');
 // Somente o adaptador autorizado pode consultar; nunca fetch arbitrário ou scraping.
 const product=productSchema.parse(await adapters[store].lookup(url,user.id));
 return Response.json({product:{...product,operation}});
}catch(e){return apiError(e);}}
