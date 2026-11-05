'use client';
import { createClient } from '@supabase/supabase-js';
export const live = process.env.NEXT_PUBLIC_DATA_MODE === 'supabase';
export const supabase = live && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) : null;
