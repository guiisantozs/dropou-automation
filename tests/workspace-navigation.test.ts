import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {offerLocation,workspaceReturn,rememberWorkspaceScroll} from '../src/lib/workspace-navigation';
import {WorkspaceState} from '../src/components/workspace-state';
import ProductOperations,{type OperationsData} from '../src/components/product-operations';
import PublicationsWorkspace from '../src/components/publications-workspace';
import type {api} from '../src/lib/api';

function fixture(){
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test/?brand=celulares&view=catalog',pretendToBeVisual:true}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const root=createRoot(document.getElementById('root')!);
 return {dom,root,async close(){await act(async()=>root.unmount());dom.window.close();for(const [key,value]of prior){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};
}
const data:OperationsData={rows:[],total:0,page:0,more:false,recent:[],recentTotal:0,channels:{},summary:{pending:0,approved:0,published:0,recent:0,archived:0}};
const saved=(account:string,key:string,value:unknown,at=Date.now())=>window.sessionStorage.setItem('dropou.ui.v1:'+account+':'+key,JSON.stringify({value,at}));

test('offer links preserve catalog, publications, schedule and saved origins through editing without external return URLs',()=>{
 for(const view of ['catalog','publications','schedule','shopee-saved']){
  const origin='/?brand=celulares&view='+view;
  for(const intent of ['preview','schedule','telegram','edit']){
   const url=new URL(offerLocation('id','celulares',intent,origin),'https://dropou.test');
   assert.equal(url.searchParams.get('returnTo'),origin);assert.equal(url.searchParams.get('brand'),'celulares');
   assert.equal(url.pathname,intent==='edit'?'/ofertas/id/editar':'/ofertas/id');
   assert.equal(url.searchParams.get('action'),['schedule','telegram'].includes(intent)?intent:null);
  }
 }
 assert.equal(new URL(offerLocation('nova','tenis','preview','/?brand=tenis&view=catalog'),'https://dropou.test').pathname,'/ofertas/nova');
 for(const bad of ['https://evil.test/','//evil.test/','/\\evil.test','javascript:alert(1)','/api/products','/ofertas/id','/\n/evil.test','/?view='+ 'x'.repeat(2050)]){
  assert.equal(workspaceReturn(bad),undefined);assert.equal(new URL(offerLocation('id','dropou','preview',bad),'https://dropou.test').searchParams.has('returnTo'),false);
 }
});

test('returning to catalog restores filters and pagination before the first read, scoped to account and operation',async()=>{
 const f=fixture(),calls:string[]=[];
 const request=(async(path:string,method='GET')=>{assert.equal(method,'GET');calls.push(path);return data;}) as typeof api;
 try{
  saved('alice','celulares:catalog:page',2);saved('alice','celulares:catalog:filters',{q:'fone',store:'Shopee',channel:'telegram',from:'2026-11-01',to:'2026-11-15'});saved('alice','celulares:catalog:applied',{q:'fone',store:'Shopee',channel:'telegram',from:'2026-11-01',to:'2026-11-15'});
  const render=(account:string,operation:'celulares'|'tenis')=>h(WorkspaceState,{key:account+operation,account,children:h(ProductOperations,{operation,mode:'catalog',request,onOpen(){},onNavigate(){}})});
  await act(async()=>f.root.render(render('alice','celulares')));
  assert.equal(calls.length,1);const query=new URL(calls[0],'https://dropou.test').searchParams;
  assert.equal(query.get('page'),'2');assert.equal(query.get('q'),'fone');assert.equal(query.get('channel'),'telegram');assert.equal((document.querySelector('input') as HTMLInputElement).value,'fone');
  await act(async()=>f.root.render(render('bob','celulares')));let next=new URL(calls.at(-1)!,'https://dropou.test').searchParams;assert.equal(next.get('page'),'0');assert.equal(next.has('q'),false);
  await act(async()=>f.root.render(render('alice','tenis')));next=new URL(calls.at(-1)!,'https://dropou.test').searchParams;assert.equal(next.get('brand'),'tenis');assert.equal(next.has('q'),false);
  await act(async()=>f.root.render(render('alice','celulares')));next=new URL(calls.at(-1)!,'https://dropou.test').searchParams;assert.equal(next.get('page'),'2');assert.equal(next.get('q'),'fone');
 }finally{await f.close();}
});

test('expired or malformed local UI state falls back without blocking the server read',async()=>{
 const f=fixture(),calls:string[]=[];
 try{
  saved('alice','celulares:catalog:page',9,Date.now()-13*3600000);saved('alice','celulares:catalog:archived','true');saved('alice','celulares:catalog:applied',{q:'fone',store:'Shopee',channel:'telegram',from:'',to:'',brand:'dropou'});
  const request=(async(path:string)=>{calls.push(path);return data;}) as typeof api;
  await act(async()=>f.root.render(h(WorkspaceState,{account:'alice',children:h(ProductOperations,{operation:'celulares',mode:'catalog',request,onOpen(){},onNavigate(){}})})));
  assert.equal(calls.length,1);const query=new URL(calls[0],'https://dropou.test').searchParams;assert.equal(query.get('page'),'0');assert.equal(query.get('stage'),'catalog');assert.equal(query.has('q'),false);
 }finally{await f.close();}
});

test('history restores platform and page but rejects an operation outside the selected channel',async()=>{
 const f=fixture(),calls:string[]=[];
 try{
  saved('alice','celulares:publications:scope','dropou');saved('alice','celulares:publications:preset','week');saved('alice','celulares:publications:platform','telegram');saved('alice','celulares:publications:page',1);
  const request=(async(path:string)=>{calls.push(path);return {entries:[],total:0,more:false,serverNow:new Date().toISOString(),allowedBrands:['celulares'],admin:false,operators:[]};}) as typeof api;
  await act(async()=>f.root.render(h(WorkspaceState,{account:'alice',children:h(PublicationsWorkspace,{operation:'celulares',request})})));
  assert.equal(calls.length,1);const query=new URL(calls[0],'https://dropou.test').searchParams;assert.equal(query.get('brand'),'celulares');assert.equal(query.get('period'),'week');assert.equal(query.get('channel'),'telegram');assert.equal(query.get('page'),'1');
 }finally{await f.close();}
});

test('scroll position is restored once after the list is available',async()=>{
 const f=fixture(),scrolls:number[]=[];
 try{
  Object.defineProperty(window,'scrollY',{value:620,configurable:true});Object.defineProperty(window,'innerHeight',{value:600,configurable:true});Object.defineProperty(document.documentElement,'scrollHeight',{value:1800,configurable:true});
  window.scrollTo=((options:ScrollToOptions)=>scrolls.push(options.top||0)) as typeof window.scrollTo;
  rememberWorkspaceScroll();
  await act(async()=>f.root.render(h(ProductOperations,{operation:'celulares',mode:'catalog',initialData:data,onOpen(){},onNavigate(){}})));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.deepEqual(scrolls,[620]);assert.equal(window.sessionStorage.getItem('dropou.scroll:/?brand=celulares&view=catalog'),null);
 }finally{await f.close();}
});
