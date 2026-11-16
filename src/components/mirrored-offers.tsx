'use client';
import {useEffect,useRef,useState} from 'react';
import {apiForOperation,type api} from '@/lib/api';
import type {WorkspaceBrandId} from '@/lib/workspace-brands';
import {mirrorLabels,type MirrorOffer,type MirrorResponse,type MirrorEvent} from '@/lib/mirrored-offers';
import styles from './mirrored-offers.module.css';

export default function MirroredOffers({operation,request=apiForOperation(operation)}:{operation:WorkspaceBrandId;request?:typeof api}){
 const [data,setData]=useState<MirrorResponse>(),[filter,setFilter]=useState('all'),[page,setPage]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[hours,setHours]=useState(24),[limit,setLimit]=useState(10),[events,setEvents]=useState<{id:string;rows:MirrorEvent[]}>(),[confirm,setConfirm]=useState<{item:MirrorOffer;action:string}>();
 const generation=useRef(0);
 async function load(sequence=generation.current){try{const r=await request<MirrorResponse>(`/api/mirrored-offers?state=${filter}&page=${page}`);if(sequence!==generation.current)return;setData(r);setError('');}catch(e){if(sequence===generation.current)setError((e as Error).message);}}
 useEffect(()=>{const sequence=++generation.current;if(operation==='all')return;void load(sequence);const timer=setInterval(()=>void load(sequence),10000);return()=>{generation.current++;clearInterval(timer);};},[filter,page,operation]);
 useEffect(()=>{if(data){setHours(data.policy.repeat_hours);setLimit(data.policy.mirror_daily_limit);}},[data?.policy.repeat_hours,data?.policy.mirror_daily_limit]);
 async function act(action:string,item?:MirrorOffer){setBusy(true);setError('');try{await request('/api/mirrored-offers','POST',item?{action,id:item.id,version:item.version}:{action:'policy',repeatHours:hours,dailyLimit:limit});setConfirm(undefined);setNotice(action==='ready'?'Oferta revisada e pronta. Nenhuma publicação foi executada.':action==='retry'?'Nova tentativa solicitada sob o orçamento de espelhamento.':'Alteração salva.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function history(item:MirrorOffer){try{const r=await request<{events:MirrorEvent[]}>('/api/mirrored-offers?history='+item.id);setEvents({id:item.id,rows:r.events});}catch(e){setError((e as Error).message);}}
 const date=(v:string)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Bahia'}),money=(v:number)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 if(operation==='all')return <section className="settings-card"><h2>Ofertas espelhadas</h2><p>Selecione um canal para consultar sua fila.</p></section>;
 return <section className={styles.workspace} aria-label="Ofertas espelhadas">
  <div className="settings-card"><h2>Ofertas espelhadas</h2><p>Produtos da fonte Telegram autorizada, guardados para revisão neste destino. Publicação automática ainda desativada.</p><p className="fine-print muted">Nome, imagem e preço vêm da integração Shopee. Legendas e imagens Telegram não são reutilizadas. Encerrar o diagnóstico não apaga esta fila.</p>
   <div className={styles.toolbar}><label>Mostrar<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);setEvents(undefined);}}><option value="all">Produtos recebidos</option><option value="ready">Prontos para publicar</option><option value="pending">Pendentes</option><option value="failed">Falhas</option><option value="history">Histórico</option></select></label><button className="secondary" disabled={busy} onClick={()=>void load()}>Atualizar ofertas</button><span>{data?.total||0} ofertas</span></div>
   {data?.admin&&data.available&&<details><summary>Política deste canal</summary><div className={styles.toolbar}><label>Intervalo entre publicações do produto (horas)<input type="number" min={0} max={8760} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label>Chamadas de espelhamento por dia<input type="number" min={0} max={1000} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label><button className="secondary" disabled={busy} onClick={()=>void act('policy')}>Salvar política</button></div><p className="fine-print muted">O teto global e a reserva manual continuam protegidos. Produto já pendente não gera outra oferta ativa. Zero chamadas pausa novas consultas, preservando o cache.</p></details>}
  </div>
  {(error||data?.error)&&<p role="alert">{error||data?.error}</p>}{notice&&<p role="status">{notice}</p>}
  {data?.available&&!data.items.length&&<p>Nenhuma oferta neste filtro.</p>}
  <div className={styles.cards}>{data?.items.map(item=><article className={'settings-card '+styles.card} key={item.id}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   {item.image_url?<img className={styles.image} src={item.image_url} alt={item.product_name||'Produto Shopee'} width={88} height={88} referrerPolicy="no-referrer" loading="lazy"/>:<div className={styles.placeholder}>Shopee</div>}
   <div className={styles.body}><span className="badge neutral">{mirrorLabels[item.state]}</span><h3>{item.product_name||'Produto aguardando identificação'}</h3>
    {item.price!==null&&<strong>{money(item.price)}{item.price_max!==null&&Number(item.price_max)>Number(item.price)?' a '+money(item.price_max):''}</strong>}
    <small>Fonte autorizada {item.source_channel_id} · mensagem #{item.message_id} · {item.message_kind==='photo'?'foto com legenda':'texto'}</small><small>Destino sugerido: {operation}{item.destination_chat_id?' · '+item.destination_chat_id:' · configurar Telegram'}</small>
    <small>Recebida {date(item.received_at)} · {item.attempts} tentativa(s)</small>{item.checked_at&&<small>Consulta {date(item.checked_at)} · {item.data_source==='cache'?'cache da API':'API oficial'}</small>}
    {item.shop_id&&<small>Loja {item.shop_id} · produto {item.item_id}</small>}{item.last_error&&<p role="status">{item.last_error}</p>}
    <div className={styles.toolbar}>{item.affiliate_url&&<button className="secondary" onClick={()=>void navigator.clipboard.writeText(item.affiliate_url!).then(()=>setNotice('Link afiliado copiado.')).catch(()=>setError('Não foi possível copiar o link.'))}>Copiar link</button>}
     {item.canonical_url&&<a href={item.canonical_url} target="_blank" rel="noreferrer nofollow">Conferir produto</a>}
     {item.state==='pending_review'&&<button className="primary" disabled={busy} onClick={()=>setConfirm({item,action:'ready'})}>Revisar e marcar pronta</button>}
     {item.state==='ready'&&<button className="secondary" disabled={busy} onClick={()=>void act('pending',item)}>Voltar para revisão</button>}
     {item.state==='failed'&&<button className="secondary" disabled={busy} onClick={()=>setConfirm({item,action:'retry'})}>Tentar novamente</button>}
     {['received','identified','pending_review','ready','failed'].includes(item.state)&&<button className="secondary" disabled={busy} onClick={()=>setConfirm({item,action:'discard'})}>Descartar</button>}
     <button className="secondary" onClick={()=>void history(item)}>Ver histórico</button></div>
    {events?.id===item.id&&<ol>{events.rows.map(e=><li key={e.id}><small>{date(e.created_at)} · {mirrorLabels[e.to_state]} · tentativa {e.attempt}{e.detail?' · '+e.detail:''}</small></li>)}</ol>}
   </div></article>)}</div>
  {confirm&&<div className="settings-card" role="dialog" aria-label="Confirmar revisão"><h3>{confirm.action==='ready'?'Confirmar dados e destino':confirm.action==='retry'?'Confirmar nova tentativa':'Descartar esta oferta'}</h3><p>{confirm.action==='ready'?'Confira o produto, o preço consultado e o destino. Esta ação deixa a oferta pronta para a integração futura; não publica.':confirm.action==='retry'?'Uma nova tentativa pode consumir o orçamento de espelhamento. Falhas anteriores permanecem no histórico.':'O registro e seu histórico serão preservados como descartados.'}</p><button className="primary" disabled={busy} onClick={()=>void act(confirm.action,confirm.item)}>Confirmar</button><button className="secondary" disabled={busy} onClick={()=>setConfirm(undefined)}>Cancelar</button></div>}
  <div className={styles.toolbar}><button className="secondary" disabled={page===0||busy} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1}</span><button className="secondary" disabled={!data?.more||busy} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
 </section>;
}
