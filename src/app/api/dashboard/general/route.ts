import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {loadGeneralDashboard} from '@/server/general-dashboard';
export async function GET(request:Request){try{
 const {db,user,access,operation}=await sessionDb(request);
 if(!access.admin||operation!=='all')throw new Error('FORBIDDEN: O consolidado está disponível em Todas as operações para administradores.');
 const page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0);
 return Response.json(await loadGeneralDashboard(db,user.id,page),{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
