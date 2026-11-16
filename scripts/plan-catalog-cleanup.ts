// Explicit read-only impact report; never deletes records or media.
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {operationSchema} from '../src/lib/workspace-brands';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const owner=z.uuid().parse(process.argv.find(a=>a.startsWith('--owner='))?.slice(8)),brand=operationSchema.parse(process.argv.find(a=>a.startsWith('--brand='))?.slice(8));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Configure o ambiente privado do projeto para gerar o relatório de leitura.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),result=await db.rpc('dropou_catalog_cleanup_plan',{p_owner:owner,p_brand:brand,p_limit:100});
if(result.error)throw Error('Relatório indisponível. Confira a migração incremental e o acesso ao projeto.');
console.log(JSON.stringify(result.data,null,2));
