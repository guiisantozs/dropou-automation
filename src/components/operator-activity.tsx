'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {operationName} from '@/lib/workspace-brands';
type Entry={id:string;actor_id:string;brand_id:string;action:string;created_at:string};
export default function OperatorActivity(){
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;api<{activity:Entry[]}>('/api/team').then(r=>{if(alive)setRows(r.activity);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 return <section className="settings-card"><h2>Atividade dos operadores</h2><p>Aprovações, agendamentos e publicações identificam o responsável.</p>{error&&<p role="alert">{error}</p>}<div className="logs-list">{rows.map(r=><div key={r.id}><span><b>{r.action}</b><small>{operationName(r.brand_id)} · operador {r.actor_id}</small></span><time>{new Date(r.created_at).toLocaleString('pt-BR')}</time></div>)}</div>{!rows.length&&!error&&<p>Nenhuma ação registrada neste filtro.</p>}</section>;
}
