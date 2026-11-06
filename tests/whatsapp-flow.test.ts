import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {caption,productKey,Product,productSchema} from '../src/lib/domain';
import {gtaHistoricalDraft} from '../src/lib/product-draft';
import {metrics,Offer,Publication} from '../src/lib/offers';
import {copyText} from '../src/lib/clipboard';

test('GTA 6: banco transacional, preços históricos, oferta, publicação manual e RLS',async(t)=>{
 const db=new PGlite();
 const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create schema auth;
   create role authenticated;create role anon;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated,anon;
   grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${a}'),('${b}');`);
  await db.exec(readFileSync('supabase/schema.sql','utf8'));
  await db.exec(readFileSync('supabase/whatsapp-flow.sql','utf8'));
  await db.exec(readFileSync('supabase/whatsapp-flow.sql','utf8'));
  async function user(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
  async function save(p:Product){const r=await db.query<{p:Product}>('select public.dropou_save_product($1::jsonb,$2) as p',[JSON.stringify(p),productKey(p)]);return r.rows[0].p;}
  async function offer(p:Product){const r=await db.query<{o:Offer}>('select public.dropou_save_offer($1,$2::jsonb,$3) as o',[p.id,JSON.stringify(p),caption(p)]);return r.rows[0].o;}
  async function load(){const [ps,os,pubs]=await Promise.all([db.query<{data:Product}>('select data from products'),db.query<Offer>("select * from offers where status<>'excluido'"),db.query<Publication>('select * from publications')]);return {products:ps.rows.map(r=>r.data),offers:os.rows,publications:pubs.rows};}
  await user(a);
  let p=await save(productSchema.parse(gtaHistoricalDraft()));let saved:Offer;
  await t.test('cadastro persiste os valores fornecidos sem inventar URL original, estoque ou confirmação',async()=>{
   assert.equal(p.originalUrl,'');assert.equal(p.affiliateUrl,'https://meli.la/1oCLqHZ');assert.equal(p.price,418.41);assert.equal(p.previousPrice,449.9);assert.equal(p.checkedAt,null);assert.equal(p.inStock,null);assert.equal(p.pixVerified,false);
   assert.equal((await db.query('select * from price_records')).rows.length,1);
   const state=await load();assert.equal(metrics(state.products,state.offers,state.publications).products,1);
  });
  await t.test('legenda histórica é rascunho e não anuncia desconto/Pix/parcelamento como atuais',async()=>{
   saved=await offer(p);assert.equal(saved.status,'rascunho');assert.match(saved.caption,/RASCUNHO/);assert.ok(!saved.caption.includes('🔥'));assert.ok(!saved.caption.includes('Economize'));assert.ok(!saved.caption.includes('8x'));assert.ok(!saved.caption.includes('no Pix'));
   await assert.rejects(db.query('select public.dropou_publish_offer($1)',[saved.id]),/bloqueada/);
   assert.equal((await db.query('select * from publications')).rows.length,0);
  });
  await t.test('RLS bloqueia leitura, edição e associação de registros de outro usuário',async()=>{
   await user(b);assert.equal((await db.query('select * from products')).rows.length,0);assert.equal((await db.query('select * from offers')).rows.length,0);assert.equal((await db.query('select * from price_records')).rows.length,0);
   const update=await db.query("update products set canonical_url='adulterado' where id=$1 returning id",[p.id]);assert.equal(update.rows.length,0);
   await assert.rejects(db.query('select public.dropou_save_offer($1,$2::jsonb,$3)',[p.id,JSON.stringify(p),'falso']),/não encontrado/);
   await assert.rejects(db.query("insert into offers(owner_id,product_id,caption,snapshot,status) values($1,$2,'falso',$3::jsonb,'rascunho')",[b,p.id,JSON.stringify(p)]),/row-level security/);
   await user(a);
  });
  await t.test('revalidação SINTÉTICA permite oferta e calcula R$ 31,49 com centavos exatos',async()=>{
   // Isto NÃO revalida o anúncio real. Somente o teste simula uma conferência.
   p=await save({...p,checkedAt:new Date().toISOString(),inStock:true,previousVerified:true,pixVerified:true,installmentsVerified:true});
   saved=await offer(p);p=saved.snapshot;
   assert.equal(saved.status,'pronto');assert.match(saved.caption,/GTA 6 PARA PS5 EM OFERTA! #publi/);assert.match(saved.caption,/31,49/);assert.match(saved.caption,/no Pix/);assert.match(saved.caption,/8x de R\$ 56,24/);
   const state=await load();assert.equal(metrics(state.products,state.offers,state.publications).ready,1);
  });
  await t.test('cópia passa a legenda completa ao Clipboard e propaga erro de permissão',async()=>{
   let copied='';await copyText(saved.caption,{writeText:async value=>{copied=value;}});assert.equal(copied,saved.caption);
   await assert.rejects(copyText(saved.caption,{writeText:async()=>{throw new Error('negado');}}),/Não foi possível copiar/);
  });
  await t.test('banco bloqueia publicação expirada mesmo com status pronto',async()=>{
   const stale={...p,checkedAt:new Date(Date.now()-16*60000).toISOString()};
   await db.query('update products set data=$1::jsonb where id=$2',[JSON.stringify(stale),p.id]);
   await db.query('update offers set snapshot=$1::jsonb where id=$2',[JSON.stringify(stale),saved.id]);
   await assert.rejects(db.query('select public.dropou_publish_offer($1)',[saved.id]),/bloqueada/);
   assert.equal((await db.query('select * from publications')).rows.length,0);
   await db.query('update products set data=$1::jsonb where id=$2',[JSON.stringify(p),p.id]);
   await db.query('update offers set snapshot=$1::jsonb where id=$2',[JSON.stringify(p),saved.id]);
  });
  await t.test('registro manual de publicação é atômico, atualiza métricas e não duplica',async()=>{
   const r=await db.query<{p:Publication}>('select public.dropou_publish_offer($1) as p',[saved.id]);assert.equal(r.rows[0].p.channel,'whatsapp');assert.equal(r.rows[0].p.caption,saved.caption);
   await db.query('select public.dropou_publish_offer($1)',[saved.id]);
   const state=await load();assert.equal(state.products[0].status,'publicado');assert.equal(metrics(state.products,state.offers,state.publications).published,0);assert.equal(state.publications.length,1);assert.equal(state.offers[0].status,'publicado');
  });
  await t.test('exclusão remove oferta da fila e preserva histórico de preço/publicação',async()=>{
   await db.query('select public.dropou_delete_offer($1)',[saved.id]);const state=await load();assert.equal(state.offers.length,0);assert.equal(state.publications.length,1);assert.equal(metrics(state.products,state.offers,state.publications).published,0);assert.equal((await db.query('select * from price_records')).rows.length,2);
   await assert.rejects(offer(p),/já publicado/);
  });
  await t.test('anon não possui acesso aos dados e funções de mutação',async()=>{
   await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from products'),/permission denied/);await assert.rejects(db.query('select public.dropou_publish_offer($1)',[saved.id]),/permission denied/);
  });
 }finally{await db.close();}
});
