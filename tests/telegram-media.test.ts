import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sendTelegramTo,TelegramFailure} from '../src/server/telegram-core';
import {telegramText} from '../src/lib/telegram-text';
import {telegramMessageCount,telegramPresentationError} from '../src/lib/telegram-presentation';
import {emptyProduct} from '../src/lib/product-draft';
import TelegramPreview from '../src/components/telegram-preview';
const env={TELEGRAM_BOT_TOKEN:'mock-no-real-token',TELEGRAM_CHAT_ID:'-100123'},target={id:'-100123',title:'Canal simulado',key:'a'.repeat(64)},link='https://meli.la/original?x=~y~&ref=exact',text='🎮🔥 *PRODUTO EM OFERTA!* #publi\n\n🛒 Confira 👇\n'+link+'\n\n💙 Dropou o preço? A gente te avisa!';
test('sendPhoto places authorized photo above caption with formatting, exact affiliate link and one API message',async()=>{
 const calls:any[]=[];let received:string[]=[];const http:typeof fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://api.telegram.org/'));calls.push({method:String(url).split('/').at(-1),body:JSON.parse(String(init?.body))});return Response.json({ok:true,result:{message_id:11,chat:{id:target.id}}});};
 assert.deepEqual(await sendTelegramTo(env,target,text,'https://authorized.example/product-large.jpg',http,async ids=>{received=ids;},async()=>{},{mediaMode:'photo',previewUrl:link}),['11']);
 assert.equal(calls.length,1);assert.equal(calls[0].method,'sendPhoto');assert.equal(calls[0].body.show_caption_above_media,false);assert.equal(calls[0].body.caption,telegramText(text).text);assert.deepEqual(calls[0].body.caption_entities,telegramText(text).entities);assert.ok(calls[0].body.caption.includes(link));const urlEntity=calls[0].body.caption_entities.find((e:any)=>e.type==='url');assert.equal(calls[0].body.caption.slice(urlEntity.offset,urlEntity.offset+urlEntity.length),link);assert.equal(calls[0].body.link_preview_options,undefined);assert.deepEqual(received,['11']);assert.equal(calls[0].body.allow_paid_broadcast,undefined);
});
test('explicit link-preview alternative requests large media above text without promising an actual photo',async()=>{
 let body:any;await sendTelegramTo(env,target,text,undefined,async(url,init)=>{assert.match(String(url),/sendMessage$/);body=JSON.parse(String(init?.body));return Response.json({ok:true,result:{message_id:12,chat:{id:target.id}}});},async()=>{},async()=>{},{mediaMode:'link_preview',previewUrl:link});assert.deepEqual(body.link_preview_options,{is_disabled:false,show_above_text:true,prefer_large_media:true,url:link});assert.ok(body.text.includes(link));
 const html=renderToStaticMarkup(createElement(TelegramPreview,{product:{...emptyProduct(),name:'Teste'},text,presentation:{mediaMode:'link_preview',photoConfirmed:false}}));assert.match(html,/depende do Telegram/);assert.ok(!html.includes('<img'));
});
test('explicit text-only disables preview; missing photo never silently changes presentation',async()=>{
 let calls=0;const http:typeof fetch=async(_url,init)=>{calls++;assert.deepEqual(JSON.parse(String(init?.body)).link_preview_options,{is_disabled:true});return Response.json({ok:true,result:{message_id:13,chat:{id:target.id}}});};
 await assert.rejects(sendTelegramTo(env,target,text,undefined,http,async()=>{},async()=>{},{mediaMode:'photo'}),e=>e instanceof TelegramFailure&&e.outcome==='failed'&&/Adicione uma foto/.test(e.message));assert.equal(calls,0);await sendTelegramTo(env,target,text,undefined,http,async()=>{},async()=>{},{mediaMode:'text'});assert.equal(calls,1);
 assert.match(telegramPresentationError(emptyProduct(),{mediaMode:'photo',photoConfirmed:false})!,/Adicione uma foto/);assert.equal(telegramPresentationError(emptyProduct(),{mediaMode:'text',photoConfirmed:false}),null);
});
test('long captions preserve full content in two linked messages; reply preview is disabled',async()=>{
 const long='🎮 '+ 'Texto preservado '.repeat(90)+'\n'+link,calls:any[]=[];let id=20;
 const ids=await sendTelegramTo(env,target,long,'https://authorized.example/large.jpg',async(url,init)=>{calls.push({method:String(url).split('/').at(-1),body:JSON.parse(String(init?.body))});return Response.json({ok:true,result:{message_id:++id,chat:{id:target.id}}});},async()=>{},async()=>{},{mediaMode:'photo',previewUrl:link});assert.deepEqual(ids,['21','22']);assert.equal(calls[0].body.caption,undefined);assert.equal(calls[0].body.show_caption_above_media,false);assert.equal(calls[1].body.text,long);assert.deepEqual(calls[1].body.reply_parameters,{message_id:21});assert.deepEqual(calls[1].body.link_preview_options,{is_disabled:true});assert.equal(telegramMessageCount(long,'photo'),2);
});
test('partial media delivery retains receipt and never retries; oversized text fails before API call',async()=>{
 let calls=0;await assert.rejects(sendTelegramTo(env,target,'a'.repeat(1500), 'https://authorized.example/large.jpg',async()=>{if(++calls===1)return Response.json({ok:true,result:{message_id:31,chat:{id:target.id}}});throw new Error('simulated timeout');}),e=>e instanceof TelegramFailure&&e.outcome==='partial'&&e.ids[0]==='31');assert.equal(calls,2);
 calls=0;await assert.rejects(sendTelegramTo(env,target,'a'.repeat(4097),undefined,async()=>{calls++;throw new Error('Must not call');}),/limite/);assert.equal(calls,0);
});
test('preview uses publication photo before caption and never uses the catalog thumbnail as cover',()=>{
 const p={...emptyProduct(),name:'Controle',image:'https://authorized.example/full.jpg',thumbnailPath:'10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.webp'},html=renderToStaticMarkup(createElement(TelegramPreview,{product:p,text,presentation:{mediaMode:'photo',photoConfirmed:true}}));assert.ok(html.indexOf('publication-cover')<html.indexOf('message-preview'));assert.ok(html.includes(p.image));assert.ok(!html.includes(p.thumbnailPath));assert.match(telegramPresentationError(p,{mediaMode:'photo',photoConfirmed:false})!,/Confirme/);assert.equal(telegramPresentationError(p,{mediaMode:'photo',photoConfirmed:true}),null);
});
