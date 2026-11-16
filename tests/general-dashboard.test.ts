import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDistribution,dashboardWeek,readDashboardPages,type DashboardReceipt,type DashboardJob} from '../src/lib/general-dashboard';

const receipt=(changes:Partial<DashboardReceipt>={}):DashboardReceipt=>({id:'r',product_id:'a',brand_id:'dropou',channel:'telegram',source:'telegram_receipt',occurred_at:'2026-11-16T03:00:00Z',...changes});
const job=(changes:Partial<DashboardJob>={}):DashboardJob=>({id:'j',product_id:'b',brand_id:'dropou',channel:'telegram',state:'queued',scheduled_at:'2026-11-16T16:00:00Z',...changes});

test('general distribution counts each active product once across channels/reposts and keeps uncertain jobs out of scheduled',()=>{
 const products=[{id:'a',brand_id:'dropou',curation_state:'approved'},{id:'b',brand_id:'dropou',curation_state:'approved'},{id:'c',brand_id:'dropou',curation_state:'approved'},{id:'d',brand_id:'dropou',curation_state:'pending'},{id:'e',brand_id:'dropou',curation_state:'rejected'},{id:'a',brand_id:'celulares',curation_state:'pending'}];
 const result=dashboardDistribution(products,[receipt(),receipt({id:'r2',channel:'whatsapp',source:'manual_mark'})],[job(),job({id:'j2',channel:'whatsapp'}),job({product_id:'a'}),job({product_id:'c',state:'uncertain'})]);
 assert.deepEqual(Object.fromEntries(result.map(s=>[s.key,s.value])),{published:1,waiting:1,scheduled:1,curation:2});assert.equal(result.reduce((n,s)=>n+s.value,0),5);
});

test('weekly chart uses confirmed sources, actual Bahia dates, all seven days and independent Telegram/WhatsApp totals',()=>{
 const same=receipt(),records=[same,same,receipt({id:'yesterday',occurred_at:'2026-11-16T02:59:59Z'}),receipt({id:'wa',channel:'whatsapp',source:'whatsapp_manual'}),receipt({id:'wa-mark',channel:'whatsapp',source:'manual_mark'}),receipt({id:'tg-manual',source:'manual_mark'}),receipt({id:'prepared',source:'prepared'}),receipt({id:'missing-date',occurred_at:null}),receipt({id:'invalid',occurred_at:'invalid'}),receipt({id:'old',occurred_at:'2026-11-01T16:00:00Z'}),receipt({id:'future',occurred_at:'2026-11-17T16:00:00Z'})];
 const days=dashboardWeek(records,Date.parse('2026-11-16T20:00:00Z'));assert.equal(days.length,7);assert.equal(days[0].day,'2026-11-10');assert.deepEqual(days[5],{day:'2026-11-15',telegram:1,whatsapp:0});assert.deepEqual(days[6],{day:'2026-11-16',telegram:1,whatsapp:2});assert.equal(days.reduce((n,d)=>n+d.telegram+d.whatsapp,0),4);
});

test('read-only summary pagination includes every internal page and refuses partial or oversized scans',async()=>{
 const source=Array.from({length:1201},(_,i)=>({id:i})),calls:number[][]=[];
 const rows=await readDashboardPages(async(from,to)=>{calls.push([from,to]);return {data:source.slice(from,to+1),error:null};});assert.deepEqual(rows,source);assert.deepEqual(calls,[[0,499],[500,999],[1000,1499]]);
 await assert.rejects(readDashboardPages(async(from)=>({data:from?null:source.slice(0,500),error:from?{message:'safe fixture'}:null})),/resumo completo/);
 let count=0;await assert.rejects(readDashboardPages(async()=>{count++;return {data:source.slice(0,500),error:null};}),/limite de leitura/);assert.equal(count,100);
});
