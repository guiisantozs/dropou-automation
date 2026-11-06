'use client';
import {api} from './api';
import {supabase} from './supabase';
let owner:string|undefined;
const images=new Map<string,{expires:number;url?:string;pending?:Promise<string>}>();
export function clearPrivateImages(){owner=undefined;images.clear();}
export function forgetPrivateImage(path:string){images.delete(path);}
export async function privateImageUrl(path:string){
 const session=await supabase?.auth.getSession(),id=session?.data.session?.user.id;
 if(!id||!path.startsWith(id+'/')){clearPrivateImages();throw new Error('Entre na conta proprietária da imagem.');}
 if(owner!==id){images.clear();owner=id;}
 const cached=images.get(path);if(cached&&cached.expires>Date.now()){if(cached.url)return cached.url;if(cached.pending)return cached.pending;}
 if(images.size>=64)images.delete(images.keys().next().value!);
 const entry:{expires:number;url?:string;pending?:Promise<string>}={expires:Date.now()+240000};
 entry.pending=api<{url:string}>('/api/products/image?path='+encodeURIComponent(path)).then(data=>{entry.url=data.url;entry.pending=undefined;return data.url;}).catch(error=>{images.delete(path);throw error;});images.set(path,entry);return entry.pending;
}
