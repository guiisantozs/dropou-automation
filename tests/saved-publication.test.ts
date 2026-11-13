import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savedPublicationState,type SavedPublication} from '../src/lib/saved-publication';
import {shopeeProduct} from '../src/lib/shopee-product';
import {dropouCaption} from '../src/lib/dropou-captions';
import {safePublicationCaption} from '../src/lib/publication-copy';
const now=Date.parse('2026-11-13T15:00:00Z');
function fixture():SavedPublication{
 const product={...shopeeProduct({itemId:'456',shopId:'123',name:'Controle PC Bluetooth',price:149.9,priceMax:149.9,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:1000,commission:.08,reportedDiscount:15,checkedAt:new Date(now).toISOString()}),inStock:true};
 return {product,offer:{id:'10000000-0000-4000-8000-000000000009',product_id:product.id,caption:dropouCaption(product),snapshot:product,status:'pronto',created_at:product.createdAt,updated_at:product.createdAt}};
}
test('saved cards require a saved current price and stock confirmation; no invented ready state',()=>{
 assert.ok(savedPublicationState(undefined,now).common);
 const value=fixture();assert.equal(savedPublicationState(value,now).common,null);
 assert.ok(savedPublicationState({...value,product:{...value.product,inStock:null}},now).common);
 assert.ok(savedPublicationState(value,now+16*60000).common);
 assert.ok(savedPublicationState({...value,offer:undefined},now).common);
 assert.ok(savedPublicationState({...value,archived:true},now).common);
 assert.ok(savedPublicationState({...value,product:{...value.product,image:''}},now).common);
 assert.match(savedPublicationState({...value,offer:{...value.offer!,caption:safePublicationCaption(value.product)}},now).common!,/Salve/);
});
test('Telegram receipt is required for posted status; uncertain delivery and scheduling cannot resend; WhatsApp stays independent',()=>{
 const value=fixture();
 const delivery={state:'sent',message_ids:['18'],destination_title:'Canal fixture'};
 assert.equal(savedPublicationState({...value,delivery},now).posted,true);
 assert.equal(savedPublicationState({...value,delivery},now).common,null);
 assert.equal(savedPublicationState({...value,delivery:{...delivery,message_ids:[]}},now).posted,false);
 for(const state of ['sending','uncertain','partial']){const result=savedPublicationState({...value,delivery:{...delivery,state}},now);assert.ok(result.telegram);assert.equal(result.posted,false);assert.equal(result.common,null);}
 const job={id:'fixture',channel:'telegram' as const,state:'queued',message_ids:[],scheduled_at:new Date(now+60000).toISOString(),destination_title:'Canal fixture',attempts:0};
 assert.match(savedPublicationState({...value,jobs:[job]},now).telegram!,/agendamento/);
});
