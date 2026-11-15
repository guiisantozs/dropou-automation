// Real dialog components with local fixtures; no credentials or backend.
import {createElement as h,act} from 'react';
import {createRoot} from 'react-dom/client';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import MultichannelPublication from '../src/components/multichannel-publication';
import {emptyProduct} from '../src/lib/product-draft';
import type {Offer} from '../src/lib/offers';
import type {api} from '../src/lib/api';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://dropou.test'});
for(const [k,v] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,k,{value:v,configurable:true});
const css=['globals.css','workspace.css','premium.css','publication-workspace.css'].map(f=>readFileSync('src/app/'+f,'utf8')).join('\n');
const product={...emptyProduct(),operation:'dropou' as const,name:'Fone Bluetooth com estojo carregador',price:129.9,inStock:true,checkedAt:new Date().toISOString(),affiliateUrl:'https://shopee.com.br/product/123/456'};
const offer:Offer={id:crypto.randomUUID(),product_id:product.id,snapshot:product,status:'pronto',caption:'🎧 FONE BLUETOOTH\n\nR$ 129,90\n\nConfira na loja 👇\n'+product.affiliateUrl+'\n\n#publi | Dropou',created_at:product.createdAt,updated_at:product.createdAt};
const request=(async(_path:string,method='GET')=>{if(method!=='GET')throw new Error('Visual fixtures must not write');return {options:[{brand:'dropou',name:'Tech & Games',title:'Dropou | Tech & Games 🎮',key:'a'.repeat(64),available:true,enabled:true},{brand:'celulares',name:'Celulares & Gadgets',title:'Dropou | Celulares & Gadgets 📱',key:'b'.repeat(64),available:true,enabled:false},{brand:'tenis',name:'Tênis & Sneakers',title:'Destino não configurado',available:false,enabled:false,reason:'Configure o destino Telegram deste canal.'}]};}) as typeof api;
const root=createRoot(document.getElementById('root')!);
await act(async()=>root.render(h(MultichannelPublication,{product,offer,text:offer.caption,presentation:{mediaMode:'text',photoConfirmed:false},disabled:false,request,onUpdate:async()=>{}})));
await act(async()=>document.querySelector<HTMLButtonElement>('button')!.click());
await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].click());
mkdirSync('outputs/premium-review',{recursive:true});
function save(name:string){for(const input of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))input.toggleAttribute('checked',input.checked);writeFileSync('outputs/premium-review/'+name+'.html','<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+document.getElementById('root')!.innerHTML+'</body></html>');}
save('multichannel');await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[3].click());save('multichannelschedule');
await act(async()=>root.unmount());dom.window.close();console.log('Multi-channel dialog fixtures generated.');
