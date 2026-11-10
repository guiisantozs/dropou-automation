import {sessionDb,apiError,dbError} from '@/server/session';
import {productSchema,productKey} from '@/lib/domain';
export async function POST(request:Request){try{
 const {db,user,operation}=await sessionDb(request);
 const input=await request.json();const brand=input.operation||(operation==='all'?null:operation);if(!brand||(operation!=='all'&&brand!==operation))throw new Error('Selecione a marca correta para salvar o produto.');const p=productSchema.parse({...input,operation:brand});
 if(p.imagePath&&!p.imagePath.startsWith(user.id+'/'))throw new Error('A imagem deve pertencer a este usuário.');
 if(p.demo)throw new Error('Dados demonstrativos não podem ser salvos no catálogo real.');
 if(p.checkedAt && (Date.parse(p.checkedAt)>Date.now()+1000))throw new Error('Data de conferência inválida.');
 const {data,error}=await db.rpc('dropou_save_product',{p_data:p,p_key:productKey(p)});
 if(error)throw dbError(error);
 return Response.json({product:productSchema.parse(data)});
}catch(e){return apiError(e);}}
