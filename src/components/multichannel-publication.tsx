'use client';
import {useRef,useState} from 'react';
import {Send} from 'lucide-react';
import type {Product} from '@/lib/domain';
import type {Offer} from '@/lib/offers';
import {api} from '@/lib/api';
import {bahiaInstant} from '@/lib/publication';
import type {TelegramPresentation} from '@/lib/telegram-presentation';
import {operationName,type OperationId} from '@/lib/workspace-brands';
import Dialog from './dialog';
import TelegramPreview from './telegram-preview';
type Option={brand:OperationId;name:string;title:string;key:string|null;available:boolean;reason:string;enabled:boolean};
export default function MultichannelPublication({product,offer,text,presentation,disabled,onUpdate,request=api}:{product:Product;offer?:Offer;text:string;presentation:TelegramPresentation;disabled:boolean;onUpdate:()=>Promise<void>;request?:typeof api}){
 const [open,setOpen]=useState(false),[options,setOptions]=useState<Option[]>([]),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[schedule,setSchedule]=useState(false),[date,setDate]=useState(''),[confirmed,setConfirmed]=useState(false),[attempted,setAttempted]=useState(false);
 const lock=useRef(false),requestId=useRef(''),payload=useRef<unknown>(undefined);
 async function show(){if(lock.current||!offer)return;lock.current=true;setBusy(true);setError('');try{const r=await request<{options:Option[]}>('/api/offers/'+offer.id+'/channels');setOptions(r.options);setSelected(r.options.filter(o=>o.available&&o.brand===(product.operation||'dropou')).map(o=>o.brand));setConfirmed(false);setAttempted(false);payload.current=undefined;requestId.current=crypto.randomUUID();setOpen(true);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function submit(){if(lock.current||!offer)return;lock.current=true;setBusy(true);setError('');try{
  payload.current??={requestId:requestId.current,confirmed:true,expected:offer.snapshot,caption:text,targets:options.filter(o=>selected.includes(o.brand)).map(o=>({brand:o.brand,key:o.key})),...(schedule?{scheduledAt:bahiaInstant(date)}:{}),...presentation};setAttempted(true);
  const r=await request<{outcomes:{brand:OperationId;state:string;destination_title:string;error?:string}[];alreadyReserved:boolean}>('/api/offers/'+offer.id+'/channels','POST',payload.current);
  setMessage(r.outcomes.map(o=>operationName(o.brand)+': '+(o.state==='sent'?'publicado e confirmado':o.state==='queued'?(schedule?'agendado':'pendente; confira a agenda'):o.state==='partial'?'envio parcial; confira o canal':o.state==='uncertain'?'entrega incerta; não repita':o.state==='sending'?'publicação em andamento':o.state==='blocked'?'retido para revisão':o.state==='failed'?'falhou; confira o histórico':o.state==='cancelled'?'cancelado':o.state)).join(' · '));setOpen(false);await onUpdate();
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return <div className="multichannel-publication"><button className="secondary" disabled={disabled||busy||!offer} onClick={()=>void show()}><Send size={15}/>Publicar em canais</button>{!open&&error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="section-note">{message}</p>}
 {open&&<Dialog labelledBy="multichannel-title" className="quick-publication"><div className="modal-heading"><h2 id="multichannel-title">Em quais canais publicar?</h2></div><p>A mesma legenda e apresentação aprovadas serão usadas nos canais selecionados. Cada destino terá seu próprio registro. WhatsApp permanece manual.</p>
 <fieldset disabled={busy||attempted} className="multichannel-options"><legend>Destinos Telegram</legend>{options.map(o=><label className="check-label" key={o.brand}><input type="checkbox" checked={selected.includes(o.brand)} disabled={!o.available} onChange={e=>{setSelected(s=>e.target.checked?[...s,o.brand]:s.filter(b=>b!==o.brand));setConfirmed(false);}}/><span><b>{o.name}</b><small>{o.title}{!o.available?' · '+o.reason:''}</small></span></label>)}<label className="check-label"><input type="checkbox" checked={schedule} onChange={e=>{setSchedule(e.target.checked);setConfirmed(false);}}/>Agendar em vez de publicar agora</label>{schedule&&<label>Data e hora · America/Bahia<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label>}</fieldset>
 {schedule&&options.some(o=>selected.includes(o.brand)&&!o.enabled)&&<p className="section-note notice-warning">Há canal selecionado com automação pausada. O agendamento fica salvo e só executa após a liberação dessa rotina.</p>}
 <details><summary>Conferir a prévia enviada a cada destino</summary><TelegramPreview product={product} text={text} presentation={presentation}/></details>
 {!schedule&&<label className="check-label"><input type="checkbox" checked={confirmed} disabled={busy||attempted} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo {schedule?'agendar':'enviar agora'} esta oferta nos {selected.length} canal(is) selecionado(s).</label>}{schedule&&<p className="fine-print">Ao agendar, você confirma a oferta nos canais selecionados.</p>}{error&&<p role="alert" className="form-error">{error}</p>}{attempted&&error&&<p>Uma solicitação já foi iniciada. Consultar novamente usa a mesma autorização e não repete envios.</p>}
 <div className="modal-footer"><button className="secondary" aria-label="Fechar" disabled={busy} onClick={()=>setOpen(false)}>Voltar</button><button className="primary" disabled={busy||!schedule&&!confirmed||!selected.length||schedule&&!date} onClick={()=>void submit()}>{attempted?'Consultar solicitação':schedule?'Agendar nos canais':'Confirmar envio nos canais'}</button></div></Dialog>}</div>;
}
