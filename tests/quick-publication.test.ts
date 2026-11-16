import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProduct} from '../src/lib/product-draft';
import {pricedDraftCaption} from '../src/lib/publication-copy';
import {beginQuickOfferRead,quickPublicationReason,quickOfferNeedsSave,assertQuickOfferScope,storeQuickOffer,type QuickOfferData} from '../src/lib/quick-publication';
import type {api} from '../src/lib/api';
const now=Date.parse('2026-11-16T16:00:00Z'),id='00000000-0000-4000-8000-000000000001',media={mediaMode:'photo' as const,photoConfirmed:true};
function fixture():QuickOfferData{const product={...emptyProduct(),id,operation:'dropou' as const,store:'Shopee' as const,name:'Teclado gamer mecânico',price:100,originalUrl:'https://shopee.com.br/product/1/2',affiliateUrl:'https://shopee.com.br/product/1/2',image:'https://example.invalid/photo.jpg',checkedAt:new Date(now).toISOString(),inStock:true,status:'pronto' as const},caption=pricedDraftCaption(product);return {product,serverNow:new Date(now).toISOString(),offer:{id,product_id:id,caption,snapshot:product,status:'pronto',created_at:product.createdAt,updated_at:product.createdAt}};}

test('explicit modal opening starts exactly two independent reads before the UI consumes them',async()=>{
 const d=fixture(),calls:string[]=[];let destinations!:(value:any)=>void;
 const request=(async(path:string,method='GET')=>{assert.equal(method,'GET');calls.push(path);return path.includes('/offer')?d:new Promise(resolve=>{destinations=resolve;});}) as typeof api;
 const reads=beginQuickOfferRead(request,id,'dropou');assert.equal(await reads.model,d);
 assert.deepEqual(calls,['/api/products/'+id+'/offer','/api/publication-config']);
 destinations({telegram:{available:false},slots:[]});assert.deepEqual(await reads.destinations,{telegram:{available:false},slots:[]});
 const next=beginQuickOfferRead(request,id,'dropou');await next.model;assert.equal(calls.length,4,'reopening must read fresh state');destinations({});await next.destinations;
});

test('early modal reads preserve separate errors and refuse product/operation mismatches',async()=>{
 const d=fixture();
 const request=(async(path:string)=>{if(path.includes('/offer'))return {...d,product:{...d.product,operation:'celulares'}};throw new Error('destinations unavailable');}) as typeof api;
 const reads=beginQuickOfferRead(request,id,'dropou');
 await assert.rejects(reads.model,/não pertence/);await assert.rejects(reads.destinations,/destinations unavailable/);
});
test('ready offers publish without another save; edited/new offers are saved by the action',()=>{
 const d=fixture();assert.equal(quickOfferNeedsSave(d,d.offer!.caption),false);assert.equal(quickPublicationReason(d,d.offer!.caption,'telegram',now,media),null);
 assert.equal(quickOfferNeedsSave(d,'Nova abertura\n\n'+d.offer!.caption),true);assert.equal(quickPublicationReason(d,'Nova abertura\n\n'+d.offer!.caption,'telegram',now,media),null);
 assert.equal(quickOfferNeedsSave({...d,offer:null},d.offer!.caption),true);assert.equal(quickPublicationReason({...d,offer:null},d.offer!.caption,'telegram',now,media),null);
});
test('price, stock, archive, identity, caption and photo validation remain required',()=>{
 const d=fixture(),text=d.offer!.caption;
 for(const patch of [{checkedAt:null},{inStock:false},{affiliateUrl:'https://invalid.example/1'},{demo:true}])assert.ok(quickPublicationReason({...d,product:{...d.product,...patch}},text,'telegram',now,media));
 assert.match(quickPublicationReason({...d,archived:true},text,'telegram',now,media)!,/arquivado/);
 assert.ok(quickPublicationReason(d,text,'telegram',now,{...media,photoConfirmed:false}));assert.ok(quickPublicationReason({...d,product:{...d.product,checkedAt:new Date(now+86400000).toISOString()}},text,'telegram',now,media));
 assert.ok(quickPublicationReason(d,text.replace('100,00','200,00'),'telegram',now,media));
});
test('channel evidence prevents duplicates, queued delivery and uncertain/partial retries independently',()=>{
 const d=fixture(),text=d.offer!.caption;
 for(const state of ['sending','partial','uncertain','sent','queued','ready','blocked']){
  const value={...d,jobs:[{id:'j',channel:'telegram' as const,state,scheduled_at:new Date(now+3600000).toISOString(),destination_title:'Destino',attempts:1,message_ids:state==='sent'?['1']:[]}]};
  assert.ok(quickPublicationReason(value,text,'telegram',now,media),state);assert.equal(quickPublicationReason(value,text,'whatsapp',now,media),null);
 }
 assert.ok(quickPublicationReason({...d,whatsapp:{id:'w',channel:'whatsapp',destination:'Destino',published_at:new Date(now).toISOString(),review_required:true}},text,'whatsapp',now,media));
 const sent={...d,delivery:{state:'sent',message_ids:['1'],destination_title:'Canal'}};
 assert.equal(quickPublicationReason({...sent,republications:[{id:'intent',channel:'telegram'}]},text,'telegram',now,media),null);
 assert.ok(quickPublicationReason({...d,delivery:{state:'partial',message_ids:['1'],destination_title:'Canal'},republications:[{id:'intent',channel:'telegram'}]},text,'telegram',now,media));
});
test('scope guards reject wrong product, operation and offer linkage',()=>{const d=fixture();assert.equal(assertQuickOfferScope(d,id,'dropou'),d);assert.throws(()=>assertQuickOfferScope(d,'other','dropou'));assert.throws(()=>assertQuickOfferScope(d,id,'celulares'));assert.throws(()=>assertQuickOfferScope({...d,offer:{...d.offer!,product_id:'other'}},id,'dropou'));});
test('saving edits uses only the existing save API, explicit review and canonical snapshot',async()=>{
 const d=fixture(),text='Nova abertura\n\n'+d.offer!.caption,calls:{path:string;method:string;body:any}[]=[];
 const request=(async(path:string,method:string,body:any)=>{calls.push({path,method,body});return {offer:{...d.offer,caption:body.caption},serverNow:d.serverNow};}) as typeof api;
 const result=await storeQuickOffer(request,d,text);assert.equal(result.offer!.caption,text);assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/offers');assert.equal(calls[0].body.review,false);assert.deepEqual(calls[0].body.expected,d.product);assert.equal(calls[0].body.manualEdit,true);
 await storeQuickOffer(request,d,text,true);assert.equal(calls[1].body.review,true);assert.ok(!calls.some(c=>/telegram|schedule|publish$/.test(c.path)));
 await assert.rejects(()=>storeQuickOffer(request,{...d,archived:true},text));assert.equal(calls.length,2);
});
