import {isShopeeOperation} from '@/lib/workspace-brands';
import {localHeadline} from '@/lib/ai';
import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {reserveDropouHeadline} from '@/server/dropou-captions';
import {productSchema} from '@/lib/domain';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {db,user,operation}=await sessionDb(request);
 if(!isShopeeOperation(operation))throw new Error('Chamadas dinâmicas disponíveis somente para Dropou | Tech & Games.');
 const {id}=await params,{current}=z.object({current:z.string().max(4000).default('')}).parse(await request.json());
 const r=await db.from('products').select('data,archived_at').eq('id',id).eq('owner_id',user.id).eq('brand_id',operation).single();if(r.error)throw dbError(r.error);
 if(r.data.archived_at)throw new Error('Restaure o produto antes de gerar outra chamada.');
 const p=productSchema.parse(r.data.data),admin=await publicationAdmin(user.id);
 const headline=operation==='dropou'?await reserveDropouHeadline(admin.db,user.id,p.id,p.name,current):Array.from({length:3},(_,i)=>localHeadline(p,operation,i)).find(h=>!current.startsWith(h))||localHeadline(p,operation);
 return Response.json({headline},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
