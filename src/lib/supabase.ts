'use client';
import { createClient } from '@supabase/supabase-js';
export const live = true;
export const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{detectSessionInUrl:(_url,params)=>params.type!=='recovery'&&!!(params.access_token||params.error||params.error_description||params.error_code)}}) : null;
