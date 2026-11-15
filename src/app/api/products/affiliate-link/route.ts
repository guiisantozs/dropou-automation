import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {associateMercadoLivreAffiliate} from '@/server/mercado-livre/affiliate-link';
export async function POST(request:Request){try{
 const {operation}=await sessionDb(request);if(operation==='all')throw new Error('Selecione uma operação.');
 const {url,productUrl,confirmed}=z.object({url:z.string().max(4096),productUrl:z.string().max(4096),confirmed:z.literal(true)}).parse(await request.json());
 return Response.json(await associateMercadoLivreAffiliate(url,productUrl),{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
