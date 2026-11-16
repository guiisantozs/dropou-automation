'use client';
import {useRef,useState} from 'react';
import {Copy,Share2} from 'lucide-react';
import type {Product} from '@/lib/domain';
import type {Offer} from '@/lib/offers';
import type {api} from '@/lib/api';
import {copyText} from '@/lib/clipboard';
import {publicationBlock} from '@/lib/publication';
import Dialog from './dialog';
type Destination={brand:string;name:string;title:string;url:string;available:boolean;published:boolean;reason:string};
export default function WhatsappChannelPublication({product,offer,text,disabled,request,onUpdate}:{product:Product;offer?:Offer;text:string;disabled:boolean;request:typeof api;onUpdate:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[options,setOptions]=useState<Destination[]>([]),[confirmed,setConfirmed]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const lock=useRef(false),ids=useRef(new Map<string,string>());
 async function show(){if(lock.current||!offer)return;lock.current=true;setBusy(true);setError('');try{const r=await request<{whatsappOptions:Destination[]}>('/api/offers/'+offer.id+'/channels');setOptions(r.whatsappOptions||[]);setConfirmed([]);setOpen(true);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function copy(){if(lock.current||!offer)return;lock.current=true;setBusy(true);setError('');try{
  const fresh=await request<{product:Product;offer?:Offer;serverNow:string}>('/api/products/'+product.id+'/offer');
  const issue=publicationBlock(fresh.product,fresh.offer,text,false,undefined,'priced',Date.parse(fresh.serverNow)||Date.now());if(issue||fresh.offer?.id!==offer.id||fresh.offer.caption!==text||JSON.stringify(fresh.product)!==JSON.stringify(fresh.offer.snapshot))throw new Error(issue||'A oferta mudou. Abra a versão atual antes de copiar.');
  await copyText(fresh.offer.caption);setMessage('Legenda copiada. Envie manualmente e confirme cada destino depois da publicação.');
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function mark(brand:string){if(lock.current||!offer||!confirmed.includes(brand))return;lock.current=true;setBusy(true);setError('');try{
  const key=offer.id+':'+offer.updated_at+':'+brand;let requestId=ids.current.get(key);if(!requestId){requestId=crypto.randomUUID();ids.current.set(key,requestId);}
  await request('/api/offers/'+offer.id+'/channels','PATCH',{brand,requestId,confirmed:true,expected:offer.snapshot,caption:text});setOptions(v=>v.map(o=>o.brand===brand?{...o,published:true,available:false,reason:'Publicação manual confirmada'}:o));setConfirmed(v=>v.filter(b=>b!==brand));setMessage('Publicação manual registrada somente neste destino WhatsApp.');await onUpdate();
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return <div className="whatsapp-channel-publication"><button className="tertiary" disabled={disabled||busy||!offer} onClick={()=>void show()}><Share2 size={14}/>WhatsApp em canais</button>{!open&&error&&<p role="alert" className="form-error">{error}</p>}
 {open&&<Dialog labelledBy="whatsapp-channels-title" className="quick-publication"><div className="modal-heading"><h2 id="whatsapp-channels-title">WhatsApp · publicação manual</h2></div><p>Copiar ou abrir o grupo não publica e não registra envio. Confirme cada destino somente depois de postar por lá.</p><button className="secondary" disabled={busy} onClick={()=>void copy()}><Copy size={14}/>Copiar legenda aprovada</button><div className="whatsapp-channel-options">{options.length?options.map(o=><div className="settings-card" key={o.brand}><h3>{o.name}</h3><p className="fine-print">{o.title}{o.reason?' · '+o.reason:''}</p>{o.available&&<><a className="tertiary" href={o.url} target="_blank" rel="noopener noreferrer">Abrir destino WhatsApp</a><label className="check-label"><input type="checkbox" disabled={busy} checked={confirmed.includes(o.brand)} onChange={e=>setConfirmed(v=>e.target.checked?[...v,o.brand]:v.filter(b=>b!==o.brand))}/>Publiquei manualmente em {o.name}.</label><button className="secondary" disabled={busy||!confirmed.includes(o.brand)} onClick={()=>void mark(o.brand)}>Confirmar publicação em {o.name}</button></>}</div>):<p>Nenhum destino WhatsApp autorizado disponível.</p>}</div>{message&&<p role="status" className="section-note">{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}<div className="modal-footer"><button className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Fechar</button></div></Dialog>}</div>;
}
