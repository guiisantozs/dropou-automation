'use client';
import {supabase} from './supabase';
import type {Brand} from './ai';
/** Existing private storage endpoint, explicitly scoped to the operation. */
export async function uploadProductImage(blob:Blob,brand:Brand,thumbnail=false){
 const session=await supabase?.auth.getSession();if(!session?.data.session)throw new Error('Entre na sua conta.');
 const form=new FormData();form.set('file',blob,thumbnail?'miniatura.webp':'produto.jpg');form.set('consent','true');if(thumbnail)form.set('purpose','thumbnail');
 const response=await fetch('/api/products/image?brand='+encodeURIComponent(brand),{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token},body:form});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Falha ao guardar a imagem.');return result.path as string;
}
