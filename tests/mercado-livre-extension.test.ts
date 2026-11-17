import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extensionImportSchema,extensionOperation,extensionReviewSchema,reviewedExtensionProduct,type ExtensionInbox} from '../src/lib/mercado-livre-extension';
import {createExtensionPageBridge} from '../src/lib/mercado-livre-extension-bridge';
import {extensionProposal,assertSameExtensionRequest,extensionDraft} from '../src/server/mercado-livre/extension-core';
import {importMercadoLivreData} from '../src/server/mercado-livre/import-core';
import {inboxFixture} from './fixtures/ml-extension';
import {publicationError} from '../src/lib/domain';
import type {api} from '../src/lib/api';
const url='https://produto.mercadolivre.com.br/MLB-1234567890-headset-_JM';
const input=()=>({requestId:crypto.randomUUID(),originalUrl:url,candidateUrl:'https://meli.la/fixture',itemId:'MLB1234567890',review:'candidate' as const});
test('extension protocol rejects wrong identities, credentials, untrusted URLs and disabled operations before consulting a provider',async()=>{
 for(const value of [{...input(),candidateUrl:'https://meli.la.evil.test/x'},{...input(),candidateUrl:'https://user:password@meli.la/x'},{...input(),candidateUrl:'https://meli.la/x?token=no'},{...input(),itemId:'MLB9999999999'},{...input(),originalUrl:'https://evil.test/MLB1234567890'},{...input(),review:'confirmed'},{...input(),operation:'moda'}])assert.throws(()=>extensionImportSchema.parse(value));
 for(const brand of ['all','beleza','casa','natal'] as const)assert.throws(()=>extensionOperation(brand));for(const brand of ['dropou','bruto','moda','celulares','tenis','automoto'] as const)assert.equal(extensionOperation(brand),brand);
 let loads=0;await assert.rejects(extensionProposal(input(),async()=>({itemId:'MLB9999999999',catalogId:null}),async()=>{loads++;throw Error('should not load');}),/outro anúncio/);assert.equal(loads,0);
});
test('provider denial leaves missing data, unknown stock, affiliation and variant review pending; known identity never proves commission',async()=>{
 const proposal=await extensionProposal(input(),async()=>{throw Error('blocked');},async value=>importMercadoLivreData({inputUrl:value.originalUrl,resolvedUrl:value.originalUrl,operation:'dropou'},async(_path,resource)=>({data:null,check:{resource,state:'denied',httpStatus:403}})));
 assert.equal(proposal.destinationMatch,null);assert.equal(proposal.result.product.price,0);assert.equal(proposal.result.product.image,'');assert.equal(proposal.result.product.inStock,null);assert.equal(proposal.result.product.mercadoLivreImport?.affiliateConfirmed,false);
 assert.throws(()=>reviewedExtensionProduct({...inboxFixture(),draft:proposal.result.product},extensionReviewSchema.parse({id:crypto.randomUUID(),confirmed:true,inStock:false})));
 const r=inboxFixture();r.draft.visualDetails={brand:null,model:null,selectedVariant:null,rating:null,salesCount:null,sellerName:null,displayedDiscount:null,uncertainFields:['selectedVariant']};const review={id:r.id,confirmed:true as const,inStock:false};assert.throws(()=>reviewedExtensionProduct(r,review),/variante/);
 const product=reviewedExtensionProduct(r,{...review,variant:'Preto · USB'});assert.equal(product.mercadoLivreImport?.affiliateState,'informed');assert.equal(product.mercadoLivreImport?.affiliateConfirmed,true);assert.equal(product.inStock,false);assert.ok(publicationError(product));assertSameExtensionRequest(r,{...input(),originalUrl:r.original_url});assert.throws(()=>assertSameExtensionRequest(r,{...input(),candidateUrl:'https://meli.la/changed'}));
 const draft=extensionDraft(input(),{store:'Mercado Livre',product:r.draft,checks:[],missing:[],message:'',needsScreenshot:false});assert.equal(draft.price,0);assert.equal(draft.source,undefined);
});
test('page bridge requires successful auth, binds the operation, expires in five minutes and acknowledges only a persisted platform receipt',async()=>{
 let time=10000,receipts=0,resolveReceipt:(row:ExtensionInbox)=>void=()=>{};const r=inboxFixture(),rows:ExtensionInbox[][]=[];
 const request=(async(_path:string,method='GET')=>{if(method==='GET')return {rows:[]};receipts++;return new Promise<ExtensionInbox>(resolve=>{resolveReceipt=resolve;});}) as typeof api;
 const bridge=createExtensionPageBridge('dropou',request,rows=>{assert.ok(rows);},()=>time),envelope=(command:string,extra={})=>({protocol:'dropou-ml-v1',direction:'to-page',id:crypto.randomUUID(),command,...extra});
 await assert.rejects(bridge.handle(envelope('receive',{payload:input(),connectionId:crypto.randomUUID()})),/Conexão/);assert.equal(receipts,0);
 const connected=await bridge.handle(envelope('connect'));assert.equal(connected.operation,'dropou');assert.equal(connected.expiresAt,310000);assert.equal(Object.keys(connected).sort().join(','),'connectionId,expiresAt,ok,operation');
 const payload={...input(),requestId:r.request_id},incoming=envelope('receive',{payload,connectionId:connected.connectionId});let acknowledged=false;const a=bridge.handle(incoming).then(value=>{acknowledged=true;return value;}),b=bridge.handle(incoming);assert.equal(acknowledged,false);assert.equal(receipts,1);resolveReceipt(r);assert.equal((await a).status,'pending');assert.equal((await b).requestId,payload.requestId);
 time=310001;await assert.rejects(bridge.handle(incoming),/expirada/);assert.equal(receipts,1);bridge.dispose();await assert.rejects(bridge.handle(incoming));
 const unauth=createExtensionPageBridge('dropou',(async()=>{throw Error('Entre na sua conta');}) as typeof api,()=>{});await assert.rejects(unauth.handle(envelope('connect')),/Entre/);
 const forbidden=createExtensionPageBridge('beleza',request,()=>{});await assert.rejects(forbidden.handle(envelope('connect')),/FORBIDDEN/);
 const other=createExtensionPageBridge('moda',request,()=>{});await assert.rejects(other.handle(incoming),/Conexão/);
});
