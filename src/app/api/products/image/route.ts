import {randomUUID} from 'node:crypto';
import {sessionDb,apiError} from '@/server/session';
import {adminDb} from '@/server/db';
import {removeUnusedImages} from '@/server/product-lifecycle';
import {webpDimensions} from '@/lib/thumbnail';
export async function POST(request:Request){try{
 const {user}=await sessionDb(request);
 if(Number(request.headers.get('content-length'))>3e6)throw new Error('Imagem muito grande.');
 const form=await request.formData(),file=form.get('file');
 if(form.get('consent')!=='true')throw new Error('Autorize explicitamente guardar o recorte antes de enviar.');
 const thumbnail=form.get('purpose')==='thumbnail';
 if(!(file instanceof File)||file.type!==(thumbnail?'image/webp':'image/jpeg')||file.size>(thumbnail?200000:2e6))throw new Error('Use JPEG de até 2 MB ou miniatura WebP de até 200 KB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(thumbnail){const size=webpDimensions(bytes);if(size.width!==256||size.height!==256)throw new Error('A miniatura deve ter 256 × 256 pixels.');}
 else if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('Imagem JPEG inválida.');
 const path=user.id+'/'+randomUUID()+(thumbnail?'.webp':'.jpg');
 const {error}=await adminDb().storage.from('offer-images').upload(path,bytes,{contentType:thumbnail?'image/webp':'image/jpeg',upsert:false});
 if(error)throw new Error('Armazenamento indisponível. Configure o bucket privado offer-images.');
 return Response.json({path});
}catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{
 const {user}=await sessionDb(request),body=await request.json();const path=typeof body.path==='string'?body.path:'';
 if(!new RegExp('^'+user.id+'/[a-f0-9-]{36}\\.(?:jpg|webp)$').test(path))throw new Error('Imagem não encontrada.');
 const result=await removeUnusedImages(user.id,[path]);if(!result.removed)throw new Error('Esta imagem é usada por produto, oferta ou histórico. As referências foram preservadas.');
 return Response.json({ok:true});
}catch(e){return apiError(e);}}
export async function GET(request:Request){try{
 const {user}=await sessionDb(request),path=new URL(request.url).searchParams.get('path')||'';
 if(!new RegExp('^'+user.id+'/[a-f0-9-]{36}\\.(?:jpg|webp)$').test(path))throw new Error('Imagem não encontrada.');
 const bucket=adminDb().storage.from('offer-images');const exists=await bucket.exists(path);if(!exists.data)throw new Error('A imagem foi excluída ou não está disponível. Use a prévia do link ou selecione outra foto.');
 const {data,error}=await bucket.createSignedUrl(path,300);
 if(error)throw new Error('Não foi possível disponibilizar a imagem.');return Response.json({url:data.signedUrl});
}catch(e){return apiError(e);}}
