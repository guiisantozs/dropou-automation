import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationDate,historyPeriod,telegramMessageLinks,historyStatus} from '../src/lib/publication-history';
test('publication dates use Bahia, handle day boundaries and never invent missing or invalid times',()=>{
 assert.match(publicationDate('2026-11-07T02:23:00Z'),/06\/11\/2026.*23:23/);for(const value of [undefined,null,'','inválida'])assert.equal(publicationDate(value),'Data indisponível');
 assert.deepEqual(historyPeriod('2026-11-06','2026-11-06'),{start:'2026-11-06T03:00:00.000Z',end:'2026-11-07T03:00:00.000Z'});assert.throws(()=>historyPeriod('2026-02-30'));assert.throws(()=>historyPeriod('2026-11-08','2026-11-06'));
});
test('message links require a saved channel ID and confirmed positive message receipts, never a guessed title or URL',()=>{
 assert.deepEqual(telegramMessageLinks('-100123',['14','15','14'],'sent'),[{id:'14',url:'https://t.me/c/123/14'},{id:'15',url:'https://t.me/c/123/15'}]);
 for(const destination of [null,'Canal Dropou','https://evil.test','-123','@dropou','-1000'])assert.deepEqual(telegramMessageLinks(destination,['14'],'sent'),[]);
 assert.deepEqual(telegramMessageLinks('-100123',['14'],'partial'),[]);assert.deepEqual(telegramMessageLinks('-100123',['0','-1','1?redirect=x','9007199254740993',14],'sent'),[]);
});
test('history differentiates provider receipts, manual confirmations, intentional republications and attempts',()=>{
 assert.equal(historyStatus({channel:'telegram',status:'sent',is_republication:true}),'Republicado no Telegram');assert.equal(historyStatus({channel:'whatsapp',status:'manual_confirmed',is_republication:false}),'Confirmado manualmente');assert.match(historyStatus({channel:'telegram',status:'uncertain',is_republication:false}),/incerta/);assert.doesNotMatch(historyStatus({channel:'telegram',status:'queued',is_republication:false}),/Publicado/);
});
