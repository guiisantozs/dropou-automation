import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {removeUnusedImages} from './product-lifecycle';
export async function maintainSavedProducts(db:SupabaseClient,owner?:string,brand?:string){
 const result=await db.rpc('dropou_saved_retention',{p_owner:owner||null,p_brand:brand||null});
 if(result.error)throw new Error('Não foi possível atualizar os prazos dos produtos salvos. Tente novamente.');
 const {cleanup=[],...summary}=result.data||{};
 let imagesPending=false;
 for(const item of cleanup as {owner:string;images:string[]}[])try{await removeUnusedImages(item.owner,item.images);}catch{imagesPending=true;}
 return {...summary,...(imagesPending?{imagesPending:true}:{})};
}
