'use client';
import {createContext,useContext,useEffect,useRef,useState,type Dispatch,type ReactNode,type SetStateAction} from 'react';
import Link from 'next/link';
import type {Product} from '@/lib/domain';
import {useQuickOffer} from './quick-offer-context';
import {currentWorkspace,offerLocation,rememberWorkspaceScroll} from '@/lib/workspace-navigation';
const Account=createContext<string|null>(null);
export function WorkspaceState({account,children}:{account:string|null;children:ReactNode}){return <Account.Provider value={account}>{children}</Account.Provider>;}
const ttl=12*3600000;
/** UI controls only: never cache products, sessions, offers or receipts. */
export function useWorkspaceField<T>(name:string,initial:T,valid:(value:unknown)=>value is T,accountOverride?:string|null):[T,Dispatch<SetStateAction<T>>,boolean]{
 const context=useContext(Account),account=accountOverride===undefined?context:accountOverride,key=account?'dropou.ui.v1:'+account+':'+name:null;
 const [value,setValue]=useState(initial),[restored,setRestored]=useState<string|null>(null),initialRef=useRef(initial),validator=useRef(valid);
 useEffect(()=>{let next=initialRef.current;if(key)try{const saved=JSON.parse(window.sessionStorage.getItem(key)||'null');if(saved&&Number.isFinite(saved.at)&&saved.at<=Date.now()&&Date.now()-saved.at<ttl&&validator.current(saved.value))next=saved.value;}catch{/* Ignore invalid or unavailable storage. */}setValue(next);setRestored(key);},[key]);
 useEffect(()=>{if(!key||restored!==key)return;try{window.sessionStorage.setItem(key,JSON.stringify({value,at:Date.now()}));}catch{/* UI state is optional. */}},[key,restored,value]);
 return [value,setValue,!key||restored===key];
}
export const validPage=(value:unknown):value is number=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=10000;
export const validText=(value:unknown):value is string=>typeof value==='string'&&value.length<500;
export const validBoolean=(value:unknown):value is boolean=>typeof value==='boolean';
export function useWorkspaceScroll(ready:boolean){
 useEffect(()=>{if(!ready)return;const origin=currentWorkspace();if(!origin)return;let saved:{y:number;at:number};try{saved=JSON.parse(window.sessionStorage.getItem('dropou.scroll:'+origin)||'null');}catch{return;}if(!saved||!Number.isFinite(saved.y)||saved.y<0||Date.now()-saved.at>ttl)return;
  let frame=0,attempts=0,cancelled=false;const stop=()=>{cancelled=true;try{window.sessionStorage.removeItem('dropou.scroll:'+origin);}catch{}};const restore=()=>{if(cancelled)return;if(document.documentElement.scrollHeight-window.innerHeight>=saved.y-2||attempts++>120){window.scrollTo({top:saved.y,behavior:'instant'});try{window.sessionStorage.removeItem('dropou.scroll:'+origin);}catch{}return;}frame=window.requestAnimationFrame(restore);};frame=window.requestAnimationFrame(restore);
  window.addEventListener('wheel',stop,{passive:true});window.addEventListener('touchstart',stop,{passive:true});window.addEventListener('keydown',stop);return()=>{cancelled=true;window.cancelAnimationFrame(frame);window.removeEventListener('wheel',stop);window.removeEventListener('touchstart',stop);window.removeEventListener('keydown',stop);};
 },[ready]);
}
export function WorkspaceOfferLink({id,brand,view,intent='preview',fragment,children,className,title,product,'aria-label':ariaLabel}:{product?:Product;id:string;brand:string;view?:string;intent?:'preview'|'schedule'|'telegram'|'edit';fragment?:'publication-history';children:ReactNode;className?:string;title?:string;'aria-label'?:string}){
 const quick=useQuickOffer();
 const [origin,setOrigin]=useState('/?brand='+brand+(view?'&view='+view:''));
 useEffect(()=>setOrigin(currentWorkspace()||'/?brand='+brand+(view?'&view='+view:'')),[brand,view]);
 return <Link prefetch={quick?false:undefined} className={className} title={title} aria-label={ariaLabel} href={offerLocation(id,brand,intent,origin)+(fragment?'#'+fragment:'')} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0&&quick?.open({id,operation:brand,intent,product,history:fragment==='publication-history'})){event.preventDefault();return;}rememberWorkspaceScroll();}}>{children}</Link>;
}
