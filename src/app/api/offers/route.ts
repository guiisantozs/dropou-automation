import {sessionDb,apiError,dbError} from '@/server/session';
import {caption,productSchema} from '@/lib/domain';
import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {savedCaptionError,confirmedConditions} from '@/lib/publication-copy';
import {dropouCaption,replaceDropouOpening} from '@/lib/dropou-captions';
import {publicationAdmin} from '@/server/telegram-offer';
import {reserveDropouHeadline} from '@/server/dropou-captions';
export async function POST(request:Request){try{
 const {db,user}=await sessionDb(request);
 const {productId,caption:selected,expected,originalCaption,manualEdit,review}=z.object({productId:z.string().uuid(),caption:z.string().min(1).max(4000).optional(),originalCaption:z.string().min(1).max(4000).optional(),manualEdit:z.boolean().default(false),expected:productSchema.optional(),review:z.boolean().default(false)}).parse(await request.json());
 const {data:row,error:readError}=await db.from('products').select('data').eq('id',productId).eq('owner_id',user.id).single();
 if(readError)throw dbError(readError);
 const p=productSchema.parse(row.data);
 if(review&&(!selected||!expected))throw new Error('Revise e salve a legenda exibida antes de publicar.');
 if(selected&&(!expected||!isDeepStrictEqual(p,expected)))throw new Error('Produto alterado. Confira a legenda novamente.');
 if(selected){const issue=savedCaptionError(selected,p);if(issue)throw new Error(issue);}
 let final=selected||caption(p),original=originalCaption||final;
 if((p.operation||'dropou')==='dropou'&&!manualEdit&&(!selected||selected===dropouCaption(p))){
  const existing=await db.from('offers').select('id').eq('product_id',p.id).eq('owner_id',user.id).neq('status','excluido').maybeSingle();if(existing.error)throw dbError(existing.error);
  if(!existing.data){const admin=await publicationAdmin(user.id),headline=await reserveDropouHeadline(admin.db,user.id,p.id,p.name);final=replaceDropouOpening(dropouCaption(p),headline);original=final;}
 }
 const {data,error}=await db.rpc('dropou_save_offer_version',{p_product:p.id,p_expected:p,p_caption:final,p_original:original,p_manual:manualEdit});
 if(error)throw dbError(error);
 if(review&&(p.operation||'dropou')==='dropou'&&!confirmedConditions(data.snapshot)){
  const {db:admin}=await publicationAdmin(user.id);
  const checked=await admin.rpc('dropou_publication_reconfirm',{p_owner:user.id,p_offer:data.id,p_expected:data.snapshot});if(checked.error)throw dbError(checked.error);
  return Response.json({offer:checked.data,serverNow:checked.data.snapshot.checkedAt});
 }
 return Response.json({offer:data,serverNow:new Date().toISOString()});
}catch(e){return apiError(e);}}
