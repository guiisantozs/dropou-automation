import {randomUUID} from 'node:crypto';
import {sessionDb,apiError} from '@/server/session';
import {adminDb} from '@/server/db';
export async function POST(request:Request){try{
 const {user}=await sessionDb(request);
 if(Number(request.headers.get('content-length'))>3e6)throw new Error('Imagem muito grande.');
 const form=await request.formData(),file=form.get('file');
 if(form.get('consent')!=='true')throw new Error('Autorize explicitamente guardar o recorte antes de enviar.');
 if(!(file instanceof File)||file.type!=='image/jpeg'||file.size>2e6)throw new Error('Envie JPEG de até 2 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('Imagem JPEG inválida.');
 const path=user.id+'/'+randomUUID()+'.jpg';
 const {error}=await adminDb().storage.from('offer-images').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
 if(error)throw new Error('Armazenamento indisponível. Configure o bucket privado offer-images.');
 return Response.json({path});
}catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{
 const {user}=await sessionDb(request),body=await request.json();const path=typeof body.path==='string'?body.path:'';
 if(!new RegExp('^'+user.id+'/[a-f0-9-]{36}\\.jpg$').test(path))throw new Error('Imagem não encontrada.');
 const db=adminDb(),owned=await db.from('products').select('id,data').eq('owner_id',user.id).contains('data',{imagePath:path});
 if(owned.error)throw new Error('Não foi possível verificar as ofertas que usam esta imagem.');
 if(owned.data.some(row=>row.data.status==='agendado'))throw new Error('Remova o agendamento ou escolha outra imagem antes de excluir este arquivo.');
 if(owned.data.length){const sending=await db.from('deliveries').select('product_id').eq('owner_id',user.id).eq('state','sending').in('product_id',owned.data.map(p=>p.id));if(sending.error||sending.data.length)throw new Error('Aguarde o envio Telegram antes de excluir a imagem.');}
 const {error}=await db.storage.from('offer-images').remove([path]);if(error)throw new Error('Não foi possível excluir a imagem.');
 return Response.json({ok:true});
}catch(e){return apiError(e);}}
export async function GET(request:Request){try{
 const {user}=await sessionDb(request),path=new URL(request.url).searchParams.get('path')||'';
 if(!new RegExp('^'+user.id+'/[a-f0-9-]{36}\\.jpg$').test(path))throw new Error('Imagem não encontrada.');
 const bucket=adminDb().storage.from('offer-images');const exists=await bucket.exists(path);if(!exists.data)throw new Error('A imagem foi excluída ou não está disponível. Use a prévia do link ou selecione outra foto.');
 const {data,error}=await bucket.createSignedUrl(path,300);
 if(error)throw new Error('Não foi possível disponibilizar a imagem.');return Response.json({url:data.signedUrl});
}catch(e){return apiError(e);}}
