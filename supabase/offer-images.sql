-- Bucket privado; apenas o backend autenticado assina URLs para o próprio dono.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offer-images','offer-images',false,2000000,array['image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2000000,allowed_mime_types=array['image/jpeg','image/webp'];
