'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {workspaceBrands,karenOperations,kesiaOperations,operationSchema,type OperationId} from '@/lib/workspace-brands';
type Member={member_id:string;display_name?:string|null;role:string;brands:OperationId[];active:boolean};
export default function TeamSettings(){
 const [admin,setAdmin]=useState(false),[members,setMembers]=useState<Member[]>([]),[email,setEmail]=useState(''),[name,setName]=useState(''),[role,setRole]=useState('operator'),[brands,setBrands]=useState<OperationId[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const r=await api<{access:{admin:boolean};members:Member[]}>('/api/team');setAdmin(r.access.admin);setMembers(r.members);}
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[]);
 if(!admin)return null;
 return <section className="settings-card"><h2>Equipe e acesso aos dashboards</h2><p>Associe uma conta existente no Supabase Auth. Integrantes acessam somente as marcas selecionadas; administradores acessam todas, inclusive as futuras.</p>
 <button className="secondary team-karen-preset" onClick={()=>{setName('Karen');setRole('operator');setBrands([...karenOperations]);setMessage('Perfil preparado. Informe o e-mail real da conta da Karen e salve para associar.');}}>Preparar acesso da Karen</button>
 <button className="secondary team-karen-preset" onClick={()=>{setName('Kesia');setRole('operator');setBrands([...kesiaOperations]);setMessage('Perfil preparado. Informe o e-mail da conta da Kesia e salve para associar.');}}>Preparar acesso da Kesia</button>
 <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{await api('/api/team','POST',{email,role,brands:role==='admin'?[...operationSchema.options]:brands,...(name?{displayName:name}:{})});await load();setEmail('');setMessage('Acesso salvo. As permissões já valem no servidor e no banco.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>
 <div className="form-grid"><label>Nome do integrante<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><label>Email da conta<input type="email" value={email} required onChange={e=>setEmail(e.target.value)}/></label><label>Perfil<select value={role} onChange={e=>setRole(e.target.value)}><option value="operator">Integrante</option><option value="admin">Administrador</option></select></label></div>
 {role==='operator'?<fieldset><legend>Dashboards autorizados</legend><div className="copy-actions">{workspaceBrands.filter(b=>b.id!=='all').map(b=><label key={b.id} className="check-label"><input type="checkbox" checked={brands.includes(b.id as OperationId)} onChange={e=>setBrands(v=>e.target.checked?[...v,b.id as OperationId]:v.filter(id=>id!==b.id))}/>{b.name}</label>)}</div></fieldset>:<p>O perfil administrador inclui todos os dashboards disponíveis e futuros.</p>}
 <button className="primary" disabled={busy||role==='operator'&&!brands.length}>Salvar acesso</button></form>
 <div className="logs-list">{members.map(m=><div key={m.member_id}><span><b className="team-member-name">{m.display_name||'Integrante'}</b><small>{m.role==='admin'?'Administrador · todos os dashboards':m.brands.map(id=>workspaceBrands.find(b=>b.id===id)?.name).join(' · ')}</small><small>{m.active?'Ativo':'Suspenso'}</small></span><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/team','PATCH',{memberId:m.member_id,active:!m.active});await load();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>{m.active?'Suspender acesso':'Reativar acesso'}</button></div>)}</div><p role="status">{message}</p></section>;
}
