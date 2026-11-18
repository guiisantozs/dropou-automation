'use client';
import {useEffect,useId,useRef,useState} from 'react';

type CommonProps={label?:string;text?:string;className?:string;disabled?:boolean};
type DeleteButtonProps=CommonProps&{onConfirm:()=>void|boolean|Promise<void|boolean>;onCancel?:()=>void;defaultOpen?:boolean;confirmLabel?:string;successText?:string};

function Bin(){return <svg className="delete-motion-bin" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="delete-motion-wall" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><g className="delete-motion-lid"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></g></svg>;}
function Check(){return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 7"/></svg>;}

// Opens the existing detailed confirmation when schedules/history need explaining.
export function DeleteTrigger({label='Excluir produto',text,className='',disabled,onClick}:{onClick:()=>void}&CommonProps){return <button type="button" className={'delete-motion-trigger '+className} aria-label={label} title={label} disabled={disabled} onClick={onClick}><span className="delete-motion-tile"><Bin/></span><span className={text?undefined:'sr-only'}>{text||label.split(':')[0]}</span></button>;}

export default function DeleteButton({label='Excluir produto',text,className='',disabled,onConfirm,onCancel,defaultOpen=false,confirmLabel='Confirmar exclusão',successText='Produto excluído.'}:DeleteButtonProps){
 const [open,setOpen]=useState(defaultOpen),[status,setStatus]=useState<'idle'|'pending'|'done'|'kept'|'error'>('idle'),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),locked=useRef(false),alive=useRef(true),panelId=useId();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(status!=='done'&&status!=='kept')return;trigger.current?.focus();const timer=setTimeout(()=>setStatus('idle'),status==='done'?1400:600);return()=>clearTimeout(timer);},[status]);
 function cancel(){if(locked.current)return;setOpen(false);setStatus('kept');setError('');onCancel?.();}
 async function confirm(){if(disabled||locked.current)return;locked.current=true;setStatus('pending');setError('');try{const result=await onConfirm();if(!alive.current)return;if(result===false){setStatus('idle');return;}setOpen(false);setStatus('done');}catch(e){if(alive.current){setStatus('error');setError(e instanceof Error?e.message:'Não foi possível excluir. Tente novamente.');}}finally{locked.current=false;}}
 return <div className={'delete-motion '+className} data-state={open?'open':'closed'} data-status={status} onKeyDown={e=>{if(e.key==='Escape'&&(open||locked.current)){e.preventDefault();e.stopPropagation();cancel();}}}>
  {text&&<span className="delete-motion-label">{text}</span>}
  <div className="delete-motion-control">
   <button ref={trigger} type="button" className="delete-motion-toggle" title={label} aria-label={label} aria-expanded={open} aria-controls={panelId} disabled={disabled||status==='pending'} onClick={()=>{if(open)cancel();else {setError('');setStatus('idle');setOpen(true);}}}>{status==='done'?<Check/>:<Bin/>}</button>
   {open&&<div className="delete-motion-panel" id={panelId} role="group" aria-label={confirmLabel}>
    <button type="button" className="delete-motion-confirm" aria-label={confirmLabel} title={confirmLabel} disabled={disabled||status==='pending'} onClick={()=>void confirm()}>{status==='pending'?<span className="delete-motion-spinner" aria-hidden="true"/>:<Check/>}<span className="sr-only">{confirmLabel}</span></button>
    <button type="button" className="delete-motion-cancel" aria-label="Cancelar exclusão" title="Cancelar exclusão" disabled={status==='pending'} onClick={cancel}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg></button>
   </div>}
  </div>
  <span role="status" aria-live="polite" className="sr-only">{status==='pending'?'Excluindo…':status==='done'?successText:status==='kept'?'Exclusão cancelada.':''}</span>
  {error&&<span className="delete-motion-error" role="alert">{error}</span>}
 </div>;
}
