import type {SupabaseClient} from '@supabase/supabase-js';
import {dropouCalls,dropouCategory} from '../lib/dropou-captions';
export async function reserveDropouHeadline(db:SupabaseClient,owner:string,subject:string,name:string,current=''){
 const category=dropouCategory(name);
 const r=await db.rpc('dropou_caption_rotate',{p_owner:owner,p_subject:subject,p_category:category,p_candidates:[...dropouCalls[category]],p_current:current.split('\n\n')[0]});
 if(r.error||typeof r.data!=='string'||!(dropouCalls[category] as readonly string[]).includes(r.data))throw new Error('Não foi possível consultar o histórico de chamadas. Tente novamente.');
 return r.data;
}
