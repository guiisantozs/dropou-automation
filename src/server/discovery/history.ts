import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Product,productSchema} from '@/lib/domain';
import {withRecordedHistory} from '@/lib/discovery';
export async function attachRecordedHistory(db:SupabaseClient,owner:string,products:Product[]){
 if(!products.length)return products;
 const {data,error}=await db.from('price_records').select('snapshot').eq('owner_id',owner).gte('recorded_at',new Date(Date.now()-30*86400000).toISOString()).order('recorded_at',{ascending:false}).limit(500);
 if(error)throw new Error('Não foi possível verificar o histórico de preços. A consulta não será apresentada como validada.');
 const history:Product[]=[];for(const row of data||[]){const parsed=productSchema.safeParse(row.snapshot);if(parsed.success)history.push(parsed.data);}
 return withRecordedHistory(products,history);
}
