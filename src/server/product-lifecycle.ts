import 'server-only';
import {adminDb} from './db';
import {dbError} from './session';
export async function removeUnusedImages(owner:string,paths:string[]){
 const db=adminDb(),result=await db.rpc('dropou_retire_unused_images',{p_owner:owner,p_paths:paths});if(result.error)throw dbError(result.error);
 const unused=(result.data||[]) as string[];
 if(!unused.length)return {removed:0,retained:paths.length};
 const removed=await db.storage.from('offer-images').remove(unused);if(removed.error)throw new Error('Produto removido. A limpeza dos arquivos não utilizados ficou pendente; nenhum arquivo compartilhado foi excluído.');
 return {removed:unused.length,retained:paths.length-unused.length};
}
