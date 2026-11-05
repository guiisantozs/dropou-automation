'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {IntegrationStatus,Check} from '@/lib/integration-status';
import MercadoLivreDiagnosisPanel from './mercado-livre-diagnosis';
const labels={connected:'Conectado',pending:'Pendente',available:'Disponível',unavailable:'Indisponível',error:'Erro'};
export default function IntegrationStatusPanel(){
 const [data,setData]=useState<IntegrationStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(run=false){setBusy(true);setError('');try{setData(await api<IntegrationStatus>('/api/integrations/status',run?'POST':'GET'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 const rows:[string,Check|undefined][]=[['Supabase',data?.supabase],['Mercado Livre OAuth',data?.mercadoLivre.oauth],['Busca de produtos',data?.mercadoLivre.search],['Shopee',data?.shopee],['Telegram',data?.telegram]];
 return <section className="settings-card"><h2>Status das integrações</h2><p>Resultados de testes reais. A configuração de uma chave, por si só, não comprova conexão.</p>{error&&<p role="alert">{error}</p>}{rows.map(([name,check])=><div key={name}><p><b>{name}: </b>{check?name==='Mercado Livre OAuth'&&check.state==='connected'?'Autorizado e testado':labels[check.state]:'Verificando…'}</p>{check&&<p className="fine-print muted">{check.message}{check.httpStatus?` HTTP ${check.httpStatus}.`:''}{check.code?` Código: ${check.code}.`:''}{check.checkedAt?` Testado em ${new Date(check.checkedAt).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}.`:' Sem teste concluído.'}</p>}</div>)}{data?.mercadoLivre.account&&<p>Conta autorizada: {data.mercadoLivre.account.nickname} · ID {data.mercadoLivre.account.id}</p>}{data&&<details><summary>Configuração lida pelo backend</summary>{Object.entries(data.configuration).map(([key,present])=><p className="fine-print muted" key={key}>{key}: {present?'presente':'ausente'}</p>)}</details>}<button className="secondary" disabled={busy} onClick={()=>load(true)}>{busy?'Testando…':'Testar integrações'}</button><MercadoLivreDiagnosisPanel/></section>;
}
