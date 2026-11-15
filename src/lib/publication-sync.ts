'use client';
import {useEffect,useRef} from 'react';
export const publicationChangeEvent='dropou:publication-change';
export function notifyPublicationChange(){if(typeof window!=='undefined')window.dispatchEvent(new window.Event(publicationChangeEvent));}
export function usePublicationRefresh(refresh:()=>void|Promise<unknown>){
 const latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const update=()=>{clearTimeout(timer);timer=setTimeout(()=>{void Promise.resolve(latest.current()).catch(()=>{});},150);};window.addEventListener(publicationChangeEvent,update);return()=>{clearTimeout(timer);window.removeEventListener(publicationChangeEvent,update);};},[]);
}
