import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement as h,useState} from 'react';
import Dialog from '../src/components/dialog';

test('nested confirmations keep the dashboard inert, trap focus, and Escape closes only the top dialog',async()=>{
 const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<button id="origin">Abrir</button><div id="root"></div>',{url:'https://dropou.test'}),previous=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const origin=document.getElementById('origin')!;origin.focus();const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);
 function App(){const [outer,setOuter]=useState(true),[inner,setInner]=useState(false);return h('div',null,h('main',{id:'background'},'Dashboard'),outer&&h(Dialog,{labelledBy:'outer',children:null},h('h2',{id:'outer'},'Oferta'),h('button',{'aria-label':'Fechar',onClick:()=>setOuter(false)},'Fechar oferta'),h('button',{id:'nested',onClick:()=>setInner(true)},'Confirmar'),inner&&h(Dialog,{labelledBy:'inner',children:null},h('h2',{id:'inner'},'Confirmação'),h('button',{'aria-label':'Fechar',onClick:()=>setInner(false)},'Fechar confirmação'))));}
 try{
  await act(async()=>root.render(h(App)));assert.equal(document.getElementById('background')!.getAttribute('aria-hidden'),'true');assert.equal(document.body.style.overflow,'hidden');
  await act(async()=>document.getElementById('nested')!.click());assert.equal(document.querySelectorAll('[role=dialog]').length,2);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelectorAll('[role=dialog]').length,1);assert.equal(document.getElementById('background')!.getAttribute('aria-hidden'),'true');
  const last=document.getElementById('nested')!;last.focus();await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement?.getAttribute('aria-label'),'Fechar');
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelectorAll('[role=dialog]').length,0);assert.equal(document.getElementById('background')!.getAttribute('aria-hidden'),null);assert.equal(document.body.style.overflow,'');assert.equal(document.activeElement,origin);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
