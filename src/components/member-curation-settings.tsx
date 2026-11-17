'use client';
import {useEffect,useState} from 'react';
import type {ShopeeConfig} from '@/lib/shopee-automation';
import type {api} from '@/lib/api';

export default function MemberCurationSettings({config,request,onSaved}:{config:ShopeeConfig;request:typeof api;onSaved:()=>Promise<void>}){
 const [draft,setDraft]=useState(config),[keywords,setKeywords]=useState(config.keywords.join('\n')),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setDraft(config);setKeywords(config.keywords.join('\n'));},[config]);
 async function save(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setMessage('');try{await request('/api/shopee/automation','PATCH',{...draft,keywords:keywords.split('\n').map(s=>s.trim()).filter(Boolean),enabled:false,dryRun:true,requireReview:true});await onSaved();setMessage('Critérios salvos. A próxima busca usará esta configuração.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <details className="settings-card"><summary>Critérios da curadoria · administrador</summary><form onSubmit={event=>void save(event)}><p>Termos definem a busca. Produtos continuam sujeitos aos filtros de nicho. Descontos só pontuam com histórico comparável.</p><label>Termos de busca, um por linha<textarea value={keywords} disabled={busy} onChange={e=>setKeywords(e.target.value)} rows={5}/></label><div className="form-grid">{([['minPrice','Preço mínimo',0,1000000,.01],['maxPrice','Preço máximo',1,1000000,.01],['minSales','Vendas mínimas, quando informadas',0,1000000,1],['minRating','Nota mínima, quando informada',0,5,.1],['minScore','Pontuação mínima',0,100,1],['minConfidence','Cobertura mínima de evidências (%)',0,100,1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" min={min} max={max} step={step} required value={draft[key]} disabled={busy} onChange={e=>setDraft(d=>({...d,[key]:Number(e.target.value)}))}/></label>)}</div><button className="secondary" disabled={busy}>{busy?'Salvando critérios…':'Salvar critérios'}</button><p role="status">{message}</p></form></details>;
}
