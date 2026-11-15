import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {mercadoLivreImportRequest} from '@/server/mercado-livre/import';
export async function POST(request:Request){try{
 const {user,operation}=await sessionDb(request);if(operation==='all')throw new Error('Selecione uma operação.');
 const {q}=z.object({q:z.string().trim().min(3).max(180)}).parse(await request.json()),{db}=await publicationAdmin(user.id);
 const result=await mercadoLivreImportRequest(db,user.id)('/products/search?'+new URLSearchParams({status:'active',site_id:'MLB',q,limit:'5'}),'catalog');
 const raw=result.data as {results?:any[]}|null;
 const references=(raw?.results||[]).filter(r=>/^MLB\d{5,20}$/.test(r?.id)).map(r=>({id:r.id,name:typeof r.name==='string'?r.name.slice(0,180):'',image:(r.pictures||[]).map((p:any)=>p.secure_url||p.url).find((v:unknown)=>typeof v==='string'&&/^https:\/\/http2\.mlstatic\.com\//.test(v))||''})).filter(r=>r.name);
 return Response.json({references,check:result.check},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
