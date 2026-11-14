import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {operationSchema} from '@/lib/workspace-brands';
export async function GET(request:Request){try{
 const {db,user,access}=await sessionDb(request);
 const audit=await db.from('operation_audit').select('id,actor_id,brand_id,action,resource_id,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(50);if(audit.error)throw dbError(audit.error);
 if(!access.admin)return Response.json({access,members:[],activity:audit.data},{headers:{'Cache-Control':'no-store'}});
 const r=await db.from('operation_members').select('member_id,role,brands,active,created_at').eq('owner_id',user.id);if(r.error)throw dbError(r.error);
 return Response.json({access,members:r.data,activity:audit.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const {user,access}=await sessionDb(request);if(!access.admin)throw new Error('FORBIDDEN: Somente administradores gerenciam operadores.');
 const body=z.object({email:z.email(),role:z.enum(['admin','operator']),brands:z.array(operationSchema).min(1).max(6)}).parse(await request.json()),{db}=await publicationAdmin(user.id);
 let member:string|undefined;
 for(let page=1;page<=10;page++){const r=await db.auth.admin.listUsers({page,perPage:100});if(r.error)throw new Error('Não foi possível localizar a conta.');member=r.data.users.find(u=>u.email?.toLowerCase()===body.email.toLowerCase())?.id;if(member||r.data.users.length<100)break;}
 if(!member)throw new Error('Crie primeiro a conta do operador no Supabase Auth e informe o mesmo email.');
 if(member===user.id)throw new Error('O proprietário mantém o acesso administrativo existente.');
 const prior=await db.from('operation_members').select('owner_id').eq('member_id',member).maybeSingle();if(prior.error)throw dbError(prior.error);
 if(prior.data&&prior.data.owner_id!==user.id)throw new Error('Esta conta já pertence a outra equipe.');
 const owned=await db.from('operation_members').select('member_id').eq('owner_id',member).limit(1);if(owned.error)throw dbError(owned.error);if(owned.data?.length)throw new Error('Esta conta administra outra equipe.');
 const r=await db.from('operation_members').upsert({member_id:member,owner_id:user.id,role:body.role,brands:[...new Set(body.brands)],active:true},{onConflict:'member_id'});if(r.error)throw dbError(r.error);
 return Response.json({saved:true});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,access}=await sessionDb(request);if(!access.admin)throw new Error('FORBIDDEN: Somente administradores gerenciam operadores.');
 const body=z.object({memberId:z.uuid(),active:z.boolean()}).parse(await request.json()),{db}=await publicationAdmin(user.id);
 const r=await db.from('operation_members').update({active:body.active}).eq('owner_id',user.id).eq('member_id',body.memberId);if(r.error)throw dbError(r.error);return Response.json({saved:true});
}catch(e){return apiError(e);}}
