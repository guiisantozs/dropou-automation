import type {SupabaseClient} from '@supabase/supabase-js';
import type {MtprotoCatalogMatch} from '../../lib/telegram-mtproto-shopee';
import type {Scope} from './store';

export function mtprotoCatalogLookup(db:SupabaseClient){
 return async(scope:Scope,identity:{shopId:string;itemId:string}):Promise<MtprotoCatalogMatch>=>{
  const canonical='shopee.com.br/product/'+identity.shopId+'/'+identity.itemId;
  const result=await db.from('products').select('id,archived_at,name:data->>name').eq('owner_id',scope.owner).eq('brand_id',scope.brand).eq('data->>store','Shopee')
   .or('canonical_url.eq.'+canonical+',canonical_url.like.shopee.com.br/*-i.'+identity.shopId+'.'+identity.itemId+',data->source->>itemId.eq.'+identity.shopId+':'+identity.itemId)
   .order('archived_at',{nullsFirst:true}).order('id').limit(1).maybeSingle();
  if(result.error)throw new Error('catalog');
  if(!result.data)return {status:'missing'};
  return {status:'found',productId:result.data.id,name:typeof result.data.name==='string'?result.data.name.slice(0,200):'Produto cadastrado',archived:!!result.data.archived_at};
 };
}
