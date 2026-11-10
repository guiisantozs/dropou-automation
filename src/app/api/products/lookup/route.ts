import {sessionDb,apiError} from '@/server/session';
import {adapters} from '@/server/adapters';
import {productSchema} from '@/lib/domain';
import {z} from 'zod';
export async function POST(request:Request){try{
 const {user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('Selecione uma marca para consultar.');
 const {store,url}=z.object({store:z.enum(['Mercado Livre','Shopee']),url:z.string().url()}).parse(await request.json());
 if(store==='Mercado Livre'&&process.env.MERCADO_LIVRE_LOOKUP_APPROVED!=='true')throw new Error('Consulta bloqueada após HTTP 403. Use um print até obter autorização explícita para atualização de preços.');
 // Somente o adaptador autorizado pode consultar; nunca fetch arbitrário ou scraping.
 const product=productSchema.parse(await adapters[store].lookup(url,user.id));
 return Response.json({product:{...product,operation}});
}catch(e){return apiError(e);}}
