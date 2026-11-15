'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarClock,Check,Clock3,ExternalLink,MessageCircle,Pencil,RefreshCw,Send,X} from 'lucide-react';
import {api,apiForOperation} from '@/lib/api';
import {money} from '@/lib/domain';
import {operationName,selectedOperation,type OperationScope} from '@/lib/workspace-brands';
import {clockNow,serverClock} from '@/lib/publication-copy';
import {bahiaInstant} from '@/lib/publication';
import {publicationDate} from '@/lib/publication-history';
import {groupScheduledJobs,scheduleBucket,schedulingStatus,type SchedulePage,type ScheduledDestination} from '@/lib/publication-workspace';
import {usePublicationRefresh} from '@/lib/publication-sync';
import ProductMedia from './product-media';
import Dialog from './dialog';
export default function PublicationSchedule({operation=selectedOperation(),request=apiForOperation(operation),initialData}:{request?:typeof api;operation?:OperationScope;initialData?:SchedulePage}){
 const [data,setData]=useState(initialData),[page,setPage]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[now,setNow]=useState(Date.now()),[selection,setSelection]=useState<{job:ScheduledDestination;action:'edit'|'cancel'|'whatsapp'}>(),[date,setDate]=useState('');
 const [serverTime,setServerTime]=useState(()=>serverClock(initialData?.serverNow));
 useEffect(()=>setServerTime(serverClock(data?.serverNow)),[data?.serverNow]);
 const sequence=useRef(0),lock=useRef(false),alive=useRef(true);
 async function load(){const seq=++sequence.current;setLoading(true);try{const result=await request<SchedulePage>('/api/publication-jobs?brand='+operation+'&page='+page);if(alive.current&&seq===sequence.current){setData(result);setError('');}}finally{if(alive.current&&seq===sequence.current)setLoading(false);}}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 useEffect(()=>{if(initialData&&page===0)return;void load().catch(e=>setError(e.message));return()=>{sequence.current++;};},[page,operation,request,initialData]);
 usePublicationRefresh(()=>!lock.current?load():undefined);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
 const clock=clockNow(serverTime),groups=groupScheduledJobs(data?.jobs||[]);
 function choose(job:ScheduledDestination,action:'edit'|'cancel'|'whatsapp'){setDate(new Date(Date.parse(job.scheduled_at)-3*3600000).toISOString().slice(0,16));setSelection({job,action});setError('');}
 async function submit(){if(!selection||lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const {job,action}=selection;
  if(action==='whatsapp')await request('/api/publication-records?brand='+job.brand_id,'POST',{action:'mark',productId:job.product_id,requestId:crypto.randomUUID(),confirmed:true,cancelScheduled:true});
  else await request('/api/publication-jobs?brand='+job.brand_id,action==='edit'?'PATCH':'DELETE',{id:job.id,confirmed:true,...(action==='edit'?{scheduledAt:bahiaInstant(date)}:{})});
  setSelection(undefined);setMessage(action==='whatsapp'?'WhatsApp confirmado manualmente. Os outros destinos continuam independentes.':action==='edit'?'Horário atualizado. Dados, legenda e destino preservados.':'Agendamento cancelado somente neste destino.');await load();
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 function card(jobs:ScheduledDestination[]){const first=jobs[0],product=first.data,states=data?.channels[first.product_id];return <article className="pw-card pw-scheduled" key={first.brand_id+first.product_id}>
  <div className="pw-thumbnail"><ProductMedia product={product}/></div><div className="pw-card-body"><div className="pw-card-top"><div><span className="pw-channel">{operationName(first.brand_id)}</span><h3>{product.shortName||first.name}</h3><span className="pw-price">{product.price>0?money(product.price):'Preço não informado'}</span></div><time className="pw-scheduled-time" dateTime={first.scheduled_at}><CalendarClock size={16}/>{publicationDate(first.scheduled_at)}</time></div>
  <div className="pw-destinations">{jobs.map(job=>{const Icon=job.channel==='telegram'?Send:MessageCircle,editable=['queued','ready','blocked','failed'].includes(job.state),attention=scheduleBucket(job,clock)==='attention';return <div className="pw-destination" key={job.id}><Icon size={15}/><div><b>{job.channel==='telegram'?'Telegram':'WhatsApp'}</b><span>{job.destination_title||'Destino não informado'} · {publicationDate(job.scheduled_at)}</span></div><span className={'pw-status '+(attention?'pw-status-warning':'')}>{schedulingStatus(job,clock)}</span><div className="pw-small-actions">{editable&&<><button disabled={busy} aria-label={'Editar horário '+(job.channel==='telegram'?'Telegram':'WhatsApp')} onClick={()=>choose(job,'edit')}><Pencil size={14}/>Editar</button><button disabled={busy} aria-label={'Cancelar agendamento '+(job.channel==='telegram'?'Telegram':'WhatsApp')} onClick={()=>choose(job,'cancel')}><X size={14}/>Cancelar</button></>}{job.channel==='whatsapp'&&<button disabled={busy} onClick={()=>choose(job,'whatsapp')}><Check size={14}/>Marcar como enviado</button>}</div>{job.error&&<p className="pw-job-error">{job.error}</p>}</div>;})}</div>
  {(['telegram','whatsapp'] as const).filter(c=>!jobs.some(j=>j.channel===c)).map(c=><span className="pw-other-destination" key={c}>{c==='telegram'?'Telegram':'WhatsApp'}: {states?.[c]?.published?'Publicado · '+publicationDate(states[c].publishedAt):'Não agendado'}</span>)}
  <a className="pw-offer-link" href={'/ofertas/'+first.product_id+'?brand='+first.brand_id}><ExternalLink size={13}/>Abrir oferta</a></div></article>;}
 return <section className="publication-workspace" aria-busy={busy||loading}>
  <div className="pw-heading"><div><span className="eyebrow">PRÓXIMAS PUBLICAÇÕES</span><h2>Sua agenda, por destino</h2><p>Somente publicações agendadas. Telegram automático; WhatsApp com conclusão manual.</p></div><button className="secondary" disabled={busy||loading} onClick={()=>void load().catch(e=>setError(e.message))}><RefreshCw size={14}/>Atualizar</button></div>
  <div className="pw-metrics"><div><small>Agendados para hoje</small><b>{data?.summary.today??'—'}</b></div><div className="pw-next"><small>Próximo agendamento</small><b>{data?.summary.next?publicationDate(data.summary.next):'Nenhum horário futuro'}</b></div><div><small>Destinos pendentes</small><b>{data?.summary.pending??'—'}</b></div><div><small>Precisam de atenção</small><b>{data?.summary.attention??'—'}</b></div></div>
  <p className="pw-note"><Clock3 size={13}/>Horários em America/Bahia. Agendamentos concluídos ficam em Publicações.</p>
  <div aria-live="polite">{message&&<p className="section-note">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>
  {!data&&!error&&<p role="status">Carregando agendamentos…</p>}{data&&!groups.length&&<div className="overview-empty"><CalendarClock size={28}/><h3>Nenhuma publicação agendada</h3><p>Abra uma oferta e escolha a data e os destinos para publicar.</p></div>}
  {([['attention','Precisam de atenção'],['today','Hoje'],['tomorrow','Amanhã'],['upcoming','Próximos dias']] as const).map(([key,label])=>{const rows=groups.filter(j=>scheduleBucket(j[0],clock)===key);return rows.length?<section className="pw-date-group" key={key}><div className="pw-date-heading"><h3>{label}</h3><span>{rows.length} oferta(s)</span></div><div className="pw-list">{rows.map(card)}</div></section>:null;})}
  {data&&<div className="pw-pagination"><span>{data.total} oferta(s) com destino pendente · página {page+1}</span><button className="secondary" disabled={busy||loading||page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><button className="secondary" disabled={busy||loading||!data.more} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
  {selection&&<Dialog labelledBy="pw-schedule-dialog"><div className="pw-dialog"><h2 id="pw-schedule-dialog">{selection.action==='edit'?'Editar horário':selection.action==='cancel'?'Cancelar este agendamento?':'Confirmar envio manual no WhatsApp'}</h2><p>{selection.job.name}</p><p>{selection.job.destination_title} · {selection.job.channel==='telegram'?'Telegram':'WhatsApp'}</p>{selection.action==='edit'?<label>Data e hora · America/Bahia<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label>:<p>{selection.action==='cancel'?'Somente este destino será cancelado. Os outros agendamentos e o histórico serão preservados.':'Confirme que você já publicou manualmente neste destino. O lembrete do WhatsApp será concluído; nenhuma mensagem será enviada pelo Dropou.'}</p>}{error&&<p role="alert" className="form-error">{error}</p>}<div className="copy-actions"><button className={selection.action==='cancel'?'danger':'primary'} disabled={busy} onClick={()=>void submit()}>{selection.action==='edit'?'Salvar horário':selection.action==='cancel'?'Confirmar cancelamento':'Confirmar publicação manual'}</button><button className="secondary" disabled={busy} aria-label="Fechar" onClick={()=>{setSelection(undefined);setError('');}}>Voltar</button></div></div></Dialog>}
 </section>;
}
