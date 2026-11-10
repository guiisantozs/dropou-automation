import 'server-only';
import {type SupabaseClient} from '@supabase/supabase-js';
import {type OperationId} from '@/lib/workspace-brands';
import {dbError} from './session';
export async function operationSettings(db:SupabaseClient,owner:string,brand:OperationId){const r=await db.from('operation_settings').select('*').eq('owner_id',owner).eq('brand_id',brand).single();if(r.error)throw dbError(r.error);return r.data;}
