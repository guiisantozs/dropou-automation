begin;
-- An automatically prepared draft is not proof of approval. Preserve explicit
-- decisions, completed publications, and manually reviewed product snapshots.
update public.products p set curation_state='pending'
where p.brand_id='dropou' and p.archived_at is null and p.curation_state='approved'
and p.data->>'status'='encontrado' and p.data->'inStock'='null'::jsonb
and not exists(select 1 from public.dropou_operation_publications e where e.owner_id=p.owner_id and e.product_id=p.id)
and not exists(select 1 from public.shopee_offers s where s.owner_id=p.owner_id and s.prepared_product_id=p.id and s.decision='approved')
and not exists(select 1 from public.logs l where l.owner_id=p.owner_id and l.event='Decisão da curadoria' and l.detail=p.id::text||' · approved');
commit;
