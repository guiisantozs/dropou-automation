import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import DeleteButton from '../src/components/delete-button';

function fixture(){const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'}),old=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}const container=document.getElementById('root')!,root=createRoot(container);return {dom,root,container,button:(name:string)=>container.querySelector<HTMLButtonElement>('button[aria-label="'+name+'"]')!,async close(){await act(async()=>root.unmount());dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};}

test('delete motion waits for explicit confirmation, awaits completion and prevents duplicate requests',async()=>{
 const f=fixture();let calls=0,finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 try{await act(async()=>f.root.render(createElement(DeleteButton,{onConfirm:async()=>{calls++;await pending;}})));
  await act(async()=>f.button('Excluir produto').click());assert.equal(calls,0);assert.equal(f.button('Excluir produto').getAttribute('aria-expanded'),'true');
  await act(async()=>{f.button('Confirmar exclusão').click();f.button('Confirmar exclusão').click();});assert.equal(calls,1);assert.equal(f.button('Cancelar exclusão').disabled,true);assert.match(f.container.textContent!,/Excluindo/);assert.doesNotMatch(f.container.textContent!,/Produto excluído/);
  await act(async()=>finish());assert.match(f.container.textContent!,/Produto excluído/);assert.equal(f.button('Excluir produto').getAttribute('aria-expanded'),'false');assert.equal(document.activeElement===f.button('Excluir produto'),true);
 }finally{await f.close();}
});

test('failed deletion stays open, announces the error and allows retry without false success',async()=>{
 const f=fixture();let fail=true,calls=0;
 try{await act(async()=>f.root.render(createElement(DeleteButton,{defaultOpen:true,onConfirm:async()=>{calls++;if(fail)throw Error('Agendamento pendente.');}})));
  await act(async()=>f.button('Confirmar exclusão').click());assert.match(f.container.querySelector('[role=alert]')!.textContent!,/Agendamento pendente/);assert.equal(f.button('Excluir produto').getAttribute('aria-expanded'),'true');assert.doesNotMatch(f.container.textContent!,/Produto excluído/);
  fail=false;await act(async()=>f.button('Confirmar exclusão').click());assert.equal(calls,2);assert.equal(f.container.querySelector('[role=alert]'),null);assert.match(f.container.textContent!,/Produto excluído/);
 }finally{await f.close();}
});

test('Escape and cancel preserve the product; disabled confirmation cannot bypass existing guards',async()=>{
 const f=fixture();let calls=0,cancels=0;
 try{await act(async()=>f.root.render(createElement(DeleteButton,{defaultOpen:true,disabled:true,onConfirm:()=>{calls++;},onCancel:()=>{cancels++;}})));
  await act(async()=>f.button('Confirmar exclusão').click());assert.equal(calls,0);assert.equal(f.button('Cancelar exclusão').disabled,false);
  await act(async()=>f.button('Cancelar exclusão').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(cancels,1);assert.equal(calls,0);assert.match(f.container.textContent!,/cancelada/);
 }finally{await f.close();}
});
