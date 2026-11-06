'use client';
import {useEffect,useState} from 'react';
import type {Product} from '@/lib/domain';
import type {Offer} from '@/lib/offers';
import {supabase} from '@/lib/supabase';
import {api} from '@/lib/api';
export default function PublicationPhotoEditor({product,onStored}:{product:Product;onStored:(result:{product:Product;offer?:Offer;serverNow?:string})=>Promise<void>}){
 const [file,setFile]=useState<File>(),[preview,setPreview]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function store(){if(!file||!consent||busy)return;setBusy(true);setMessage('');let uploaded:string|undefined;try{
  if(file.size>10*1024*1024)throw new Error('Selecione uma foto de até 10 MB.');
  const bitmap=await createImageBitmap(file);let blob:Blob;try{const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a foto.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar JPEG.')),'image/jpeg',.88));canvas.width=canvas.height=0;}finally{bitmap.close();}
  if(blob.size>2e6)throw new Error('A foto otimizada excede 2 MB. Escolha um recorte menor.');
  const session=await supabase?.auth.getSession();if(!session?.data.session)throw new Error('Entre na sua conta.');const form=new FormData();form.set('file',blob,'produto.jpg');form.set('consent','true');
  const response=await fetch('/api/products/image',{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token},body:form}),result=await response.json();if(!response.ok)throw new Error(result.error||'Falha no upload.');uploaded=result.path;
  const saved=await api<{product:Product;offer?:Offer;serverNow?:string}>('/api/products/'+product.id+'/media','PATCH',{path:uploaded,expected:product,consent:true});await onStored(saved);setFile(undefined);setConsent(false);setMessage('Foto salva. Confira a prévia e autorize o envio. Preço e legenda foram preservados.');
 }catch(e){setMessage((e as Error).message);if(uploaded)await api('/api/products/image','DELETE',{path:uploaded}).catch(()=>{});}finally{setBusy(false);}}
 return <details className="publication-photo-editor"><summary>Selecionar ou trocar a foto sem refazer a oferta</summary><p className="fine-print">Use uma foto autorizada ou um recorte do produto já preparado. A miniatura do catálogo não é usada como capa. Nada é enviado à OpenAI.</p><label>Foto do produto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]);setConsent(false);setMessage('');}}/></label>{preview&&<img className="publication-cover" src={preview} alt="Foto selecionada para revisão"/>}<label className="check-label"><input type="checkbox" checked={consent} disabled={busy||!file} onChange={e=>setConsent(e.target.checked)}/>Autorizo guardar e usar esta foto do produto na publicação.</label><button type="button" className="secondary" disabled={!file||!consent||busy} onClick={store}>{busy?'Guardando foto…':'Guardar foto na oferta'}</button><p role="status" className="fine-print">{message}</p></details>;
}
