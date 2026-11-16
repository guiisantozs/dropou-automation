import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {loadGeneralDashboard} from '@/server/general-dashboard';

/** Presentation data only: no maintenance, provider requests or privileged client. */
export async function GET(request:Request){try{
 const {db,user,operation}=await sessionDb(request);
 if(operation==='all')throw new Error('FORBIDDEN: Selecione uma operação.');
 const page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0);
 return Response.json(await loadGeneralDashboard(db,user.id,page,Date.now(),operation),{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
