begin;
create index product_channel_marks_product_fk_idx on public.product_channel_marks(owner_id,product_id,brand_id);
create index shopee_offers_prepared_product_idx on public.shopee_offers(prepared_product_id);
commit;
