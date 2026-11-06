'use client';
import {useEffect,useRef} from 'react';
export default function Dialog({children,labelledBy,className=''}:{children:React.ReactNode;labelledBy:string;className?:string}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')||[]).filter(el=>{const closed=el.closest('details:not([open])');return !el.closest('[hidden]')&&(!closed||el.tagName==='SUMMARY'&&el.parentElement===closed);});
 focusable()[0]?.focus();const handler=(event:KeyboardEvent)=>{if(event.key==='Escape'){const close=ref.current?.querySelector<HTMLButtonElement>('[aria-label="Fechar"]');close?.click();}if(event.key==='Tab'){const items=focusable(),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',handler);
 return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',handler);previous?.focus();};},[]);
 return <div className="modal-backdrop"><section ref={ref} className={'modal '+className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</section></div>;
}
