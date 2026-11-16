import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractShopeeLinks} from '../src/server/mtproto/shopee-links';
import {MtprotoShopeeTestQueue} from '../src/server/mtproto/shopee-queue';
import {mtprotoCatalogLookup} from '../src/server/mtproto/shopee-catalog';
import {mtprotoShopeeLink,resolveMtprotoShopeeLink} from '../src/server/mtproto/shopee-resolver';
import type {ConnectionRow,Scope} from '../src/server/mtproto/store';
import type {MtprotoCatalogMatch} from '../src/lib/telegram-mtproto-shopee';

const scope={owner:'10000000-0000-4000-8000-000000000001',brand:'dropou'},url='https://shopee.com.br/product/123/456';
function fixture(options:{http?:typeof fetch;lookup?:(scope:Scope,id:any)=>Promise<MtprotoCatalogMatch>}={}){
 let time=Date.parse('2026-11-15T22:00:00Z'),active=true,calls=0,lookups=0;
 const http=options.http||((async()=>{calls++;return new Response(null,{status:302,headers:{location:url+'?affiliate=test'}});}) as typeof fetch);
 const queue=new MtprotoShopeeTestQueue(async(s,id)=>{lookups++;assert.deepEqual(s,scope);return options.lookup?options.lookup(s,id):{status:'found',productId:'local-id',name:'Produto existente'};},()=>active,()=>time,http);
 const row={id:'connection',owner_id:scope.owner,brand_id:scope.brand,status:'connected',test_channel_id:'789',test_started_at:new Date(time).toISOString(),test_expires_at:new Date(time+600000).toISOString()} as ConnectionRow;
 queue.begin(row);
 const send=(id:number,urls=[url],kind='text')=>queue.accept(row,{id,channelId:'789',date:Math.floor(time/1000),kind},{urls,invalid:0,limited:false});
 return {queue,row,send,scope,calls:()=>calls,lookups:()=>lookups,advance:(ms:number)=>{time+=ms;},disable:()=>{active=false;}};
}
test('Shopee extraction handles text/caption, visible and hidden UTF-16 entities, punctuation and three short-link hosts without retaining captions',()=>{
 const text='🎮 Link aqui e https://shopee.com.br/Mouse-i.00123.456?utm=secret. (https://s.shopee.com.br/abc123)';
 const links=extractShopeeLinks(text,[{offset:3,length:9,url:'https://br.shp.ee/abc456?tracking=private'}]);
 assert.deepEqual(links.urls,['https://br.shp.ee/abc456',url,'https://s.shopee.com.br/abc123']);
 assert.ok(!JSON.stringify(links).includes('secret'));assert.ok(!JSON.stringify(links).includes('🎮'));
 assert.deepEqual(extractShopeeLinks('shopee.com.br/product/123/456; https://shope.ee/abc789').urls,[url,'https://shope.ee/abc789']);
 assert.deepEqual(extractShopeeLinks('https://shopee.com.br/product/123/456',[{offset:0,length:37}]).urls,[url]);
});
test('malformed, deceptive and non-Shopee URLs never become fetchable candidates; unsupported official pages are diagnosed and input is bounded',()=>{
 for(const input of ['https://shopee.com.br.evil.invalid/product/123/456','https://evil.shopee.com.br/product/123/456','evil.shopee.com.br/product/123/456','https://127.0.0.1/private','https://name:password@evil.invalid/','https://meli.la/abc'])assert.equal(extractShopeeLinks(input).urls.length,0,input);
 const invalid=extractShopeeLinks('https://shopee.com.br/search?keyword=x https://shopee.com.br/%XX https://u:p@shopee.com.br/product/123/456');assert.equal(invalid.urls.length,0);assert.equal(invalid.invalid,3);
 const many=extractShopeeLinks(Array.from({length:9},(_,i)=>'https://shopee.com.br/product/123/'+(i+1)).join(' '));assert.equal(many.urls.length,5);assert.equal(many.limited,true);
 assert.equal(extractShopeeLinks('x'.repeat(17000)+url).urls.length,0);
});
test('direct identity and cached short redirects identify the catalog without any Shopee API, affiliate conversion or duplicate callbacks',async()=>{
 const f=fixture();f.send(1);f.send(1);f.send(2,['https://s.shopee.com.br/abc123'],'photo');f.send(3,['https://s.shopee.com.br/abc123']);
 await f.queue.settled(scope);const list=f.queue.snapshot(scope).items;
 assert.equal(list.length,3);assert.equal(f.calls(),1);assert.equal(f.lookups(),1);
 assert.deepEqual(list.map(x=>x.kind),['text','photo','text']);assert.ok(list.every(x=>x.state==='identified'&&x.shopId==='123'&&x.itemId==='456'&&x.catalog?.status==='found'&&x.canonicalUrl===url));
 assert.equal(list[1].repeatedInTest,true);assert.equal(list[2].repeatedInTest,true);
 assert.equal(f.queue.snapshot({...scope,owner:'different'}).items.length,0);assert.equal(f.queue.snapshot({...scope,brand:'celulares'}).items.length,0);
 assert.ok(!JSON.stringify(list).includes('affiliate=test'));
});
test('missing catalog and catalog read errors remain distinct from a successful product identity',async()=>{
 const missing=fixture({lookup:async()=>({status:'missing'})});missing.send(1);await missing.queue.settled(scope);assert.equal(missing.queue.snapshot(scope).items[0].catalog?.status,'missing');
 const failed=fixture({lookup:async()=>{throw new Error('PRIVATE DATABASE PAYLOAD');}});failed.send(1);await failed.queue.settled(scope);const item=failed.queue.snapshot(scope).items[0];assert.equal(item.state,'identified');assert.equal(item.catalog?.status,'error');assert.ok(!JSON.stringify(item).includes('PRIVATE'));
});
test('HEAD redirects refuse external targets and blocked/looping short links without retries or leaking raw errors',async()=>{
 for(const response of [()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}}),()=>new Response(null,{status:403})]){
  let calls=0;const f=fixture({http:(async()=>{calls++;return response();}) as typeof fetch});f.send(1,['https://s.shopee.com.br/abc123']);await f.queue.settled(scope);assert.equal(calls,1);assert.equal(f.queue.snapshot(scope).items[0].state,'error');assert.equal(f.lookups(),0);
 }
 let calls=0;const f=fixture({http:(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://s.shopee.com.br/loop123'}});}) as typeof fetch});f.send(1,['https://s.shopee.com.br/loop123']);await f.queue.settled(scope);assert.equal(calls,3);
});
test('affiliate HEAD redirect to the observed official opaanlp product route resolves IDs without copying tracking or requesting HTML',async()=>{
 let calls=0;
 const result=await resolveMtprotoShopeeLink('https://s.shopee.com.br/abc123',(async(_input,init)=>{calls++;assert.equal(init?.method,'HEAD');assert.equal(init?.redirect,'manual');return new Response(null,{status:301,headers:{location:'https://shopee.com.br/opaanlp/123/456?uls_trackid=private&affiliate_id=other'}});}) as typeof fetch);
 assert.equal(result.canonical,url);assert.equal(result.shopId,'123');assert.equal(result.itemId,'456');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('private'));
 assert.deepEqual(extractShopeeLinks('https://shopee.com.br/opaanlp/123/456?affiliate_id=other').urls,[url]);
 for(const bad of ['https://shopee.com.br.evil.invalid/opaanlp/123/456','https://u:p@shopee.com.br/opaanlp/123/456','http://shopee.com.br/opaanlp/123/456','https://shopee.com.br/opaanlp/0/456','https://shopee.com.br/opaanlp/123/99999999999999999999'])assert.throws(()=>mtprotoShopeeLink(bad));
});
test('only current live source, window and lease can enqueue, and new tests/stop/retention remove the bounded temporary queue',async()=>{
 const f=fixture();const base={id:1,channelId:'789',date:Date.parse(f.row.test_started_at!)/1000,kind:'text'};
 for(const message of [{...base,channelId:'wrong'},{...base,date:base.date-1},{...base,date:base.date+60},{...base,kind:'document'}])f.queue.accept(f.row,message,{urls:[url],invalid:0,limited:false});
 assert.equal(f.queue.snapshot(scope).items.length,0);
 for(let i=1;i<=60;i++)f.send(i);await f.queue.settled(scope);assert.equal(f.queue.snapshot(scope).items.length,50);assert.equal(f.queue.snapshot(scope).limitReached,true);
 f.queue.begin({...f.row,test_started_at:new Date(Date.parse(f.row.test_started_at!)+1000).toISOString()});assert.equal(f.queue.snapshot(scope).items.length,0);
 f.queue.clear(scope);assert.equal(f.queue.snapshot(scope).items.length,0);
 f.queue.begin(f.row);f.disable();f.send(70);assert.equal(f.queue.snapshot(scope).items.length,0);
 f.advance(3600001);assert.equal(f.queue.snapshot(scope).expiresAt,null);
});
test('stopping while a resolver runs cannot refill a cleared or replaced queue, and each window caps distinct short links',async()=>{
 let release!:()=>void;const waiting=new Promise<void>(r=>{release=r;});
 const f=fixture({http:(async()=>{await waiting;return new Response(null,{status:302,headers:{location:url}});}) as typeof fetch});
 f.send(1,['https://s.shopee.com.br/wait123']);const done=f.queue.settled(scope);await new Promise(r=>setTimeout(r,0));f.queue.clear(scope);release();await done;assert.equal(f.queue.snapshot(scope).items.length,0);assert.equal(f.lookups(),0);
 const capped=fixture();for(let i=1;i<=12;i++)capped.send(i,['https://s.shopee.com.br/abc'+i]);await capped.queue.settled(scope);assert.equal(capped.calls(),10);assert.equal(capped.queue.snapshot(scope).limitReached,true);assert.equal(capped.queue.snapshot(scope).items.filter(x=>x.state==='error').length,2);
});
test('catalog lookup selects only minimal catalog facts under the exact owner/brand and never writes products',async()=>{
 const calls:any[]=[];const chain:any={};for(const method of ['select','eq','or','order','limit'])chain[method]=(...args:any[])=>{calls.push([method,...args]);return chain;};chain.maybeSingle=async()=>({data:{id:'known',name:'Mouse',archived_at:null},error:null});
 const db={from:(table:string)=>{assert.equal(table,'products');return chain;}};
 const result=await mtprotoCatalogLookup(db as any)(scope,{shopId:'123',itemId:'456'});assert.equal(result.status,'found');
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='owner_id'&&c[2]===scope.owner));assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='brand_id'&&c[2]==='dropou'));
 assert.ok(calls.some(c=>c[0]==='or'&&c[1].includes('canonical_url.like.shopee.com.br/*-i.123.456')));
 assert.equal(calls[0][1],'id,archived_at,name:data->>name');
});
