'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Link2,RefreshCw,ShieldCheck,Unplug,Radio} from 'lucide-react';
import {apiForOperation,type api} from '@/lib/api';
import type {WorkspaceBrandId} from '@/lib/workspace-brands';
import type {MtprotoChannel,MtprotoCommand,MtprotoStatus} from '@/lib/telegram-mtproto';
import styles from './telegram-connections.module.css';
import TelegramShopeeTestQueue from './telegram-shopee-test-queue';

export default function TelegramConnections({operation,request=apiForOperation(operation)}:{operation:WorkspaceBrandId;request?:typeof api}){
 const sourceId=useId();
 const [status,setStatus]=useState<MtprotoStatus|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[consent,setConsent]=useState(false),[controlled,setControlled]=useState(false);
 const [channels,setChannels]=useState<MtprotoChannel[]>([]),[more,setMore]=useState(false),[selected,setSelected]=useState<string[]>([]),[source,setSource]=useState(''),[confirmDisconnect,setConfirmDisconnect]=useState(false);
 const alive=useRef(true),working=useRef(false);
 async function load(initial=false){
  const next=await request<MtprotoStatus>('/api/telegram/connections');if(!alive.current)return;
  setStatus(next);if(initial){setSelected(next.selected.map(c=>c.id));setSource(next.selected.find(c=>c.controlled)?.id||'');}
 }
 useEffect(()=>{
  alive.current=true;if(operation==='all')return()=>{alive.current=false;};
  void load(true).catch(()=>{if(alive.current)setError('Não foi possível carregar a conexão. Confira a sessão, a migração e o worker.');});
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!working.current)void load().catch(()=>{if(alive.current)setError('Não foi possível atualizar o estado da conexão.');});},5000);
  return()=>{alive.current=false;clearInterval(timer);};
 },[operation,request]);
 async function run(command:MtprotoCommand){
  if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await request<{channels?:MtprotoChannel[];more?:boolean;revocationConfirmed?:boolean}>('/api/telegram/connections','POST',command);if(!alive.current)return;
   if(command.action==='channels'){setChannels(old=>[...new Map([...(command.more?old:[]),...(result.channels||[])].map(c=>[c.id,c])).values()]);setMore(!!result.more);}
   if(command.action==='select')setNotice('Seleção salva. Escolha uma fonte controlada para iniciar o teste.');
   if(command.action==='test')setNotice('Teste iniciado por dez minutos. Publique uma nova mensagem manualmente na fonte escolhida.');
   if(command.action==='stop')setNotice('Teste encerrado e diagnósticos apagados.');
   if(command.action==='disconnect'){setChannels([]);setSelected([]);setSource('');setConfirmDisconnect(false);setNotice(result.revocationConfirmed?'Conta desconectada e sessão revogada.':'Sessão removida do Dropou. Encerre também a sessão Dropou em Dispositivos no aplicativo Telegram.');}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');}
  finally{
   if(alive.current){setPhone('');setCode('');setPassword('');await load().catch(()=>setError('Atualize o estado antes de repetir a operação.'));setBusy(false);}
   working.current=false;
  }
 }
 const available=[...new Map([...(status?.selected||[]),...channels].map(c=>[c.id,c])).values()];
 const testSources=(status?.selected||[]).filter(c=>c.controlled);
 const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Bahia'});
 if(operation==='all')return <section className="settings-card"><h2>Conexões Telegram</h2><p>Selecione uma marca para gerenciar a conexão da conta.</p></section>;
 return <div className={styles.workspace} aria-busy={busy}>
  <section className="settings-card">
   <div className={styles.heading}><div><span className="eyebrow">CONTA PESSOAL · MTPROTO</span><h2><Link2 size={20}/> Conexões Telegram</h2></div><span className="badge neutral">{status?.status==='connected'?'Conectado':status?.status==='error'?'Erro':'Desconectado'}</span></div>
   <p>Conecte sua própria conta usando a API do Telegram. Esta é uma integração independente para validar o recebimento de novas mensagens.</p>
   <p className="fine-print muted"><ShieldCheck size={14}/> A sessão fica criptografada no servidor. Código e senha de duas etapas são usados apenas durante o login.</p>
   <div className={styles.toolbar}><span>Worker: {status?.workerOnline?'online':'indisponível'}</span><button className="secondary" disabled={busy} onClick={()=>{setError('');void load().catch(()=>setError('Não foi possível atualizar a conexão.'));}}><RefreshCw size={15}/> Atualizar estado</button></div>
   {status&&!status.configured&&<p role="status">Configure a URL e o segredo do worker no servidor para conectar.</p>}
   {(error||status?.error)&&<p role="alert" className={styles.feedback}>{error||status?.error}</p>}
   {notice&&<p role="status" className={styles.feedback}>{notice}</p>}
   {!status&&<p role="status">Verificando conexão…</p>}
   {status&&status.status!=='connected'&&!status.step&&<form className={styles.form} onSubmit={e=>{e.preventDefault();void run({action:'login',phone,consent:true});}}>
    <label>Telefone com código do país<input type="tel" autoComplete="off" placeholder="+55…" required pattern="\+[1-9][0-9]{7,14}" value={phone} onChange={e=>setPhone(e.target.value.replace(/[\s()-]/g,''))}/></label>
    <label className={styles.check}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>Sou titular desta conta e autorizo o Dropou a conectar e testar somente fontes que posso acessar, conforme os termos da API.</label>
    <a href="https://core.telegram.org/api/terms" target="_blank" rel="noreferrer">Termos da API Telegram</a>
    <button className="primary" disabled={busy||!consent||!status.configured||!status.workerOnline}>Solicitar código</button>
   </form>}
   {status?.step==='code'&&<form className={styles.form} onSubmit={e=>{e.preventDefault();void run({action:'code',code});}}><label>Código de autenticação<input autoComplete="one-time-code" inputMode="numeric" type="password" required pattern="[0-9]{4,8}" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><p>Confira o código no aplicativo Telegram ou no meio indicado por ele. O login expira em cinco minutos.</p><button className="primary" disabled={busy||!status.workerOnline}>Confirmar código</button></form>}
   {status?.step==='password'&&<form className={styles.form} onSubmit={e=>{e.preventDefault();void run({action:'password',password});}}><label>Senha de verificação em duas etapas<input type="password" autoComplete="off" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy||!status.workerOnline}>Confirmar senha</button></form>}
   {status&&(status.step||status.status!=='disconnected'||status.error)&&<div className={styles.disconnect}>{confirmDisconnect?<div role="group" aria-label="Confirmar desconexão"><p>Encerrar a sessão desta conta, apagar a seleção e os diagnósticos desta marca?</p><div className="copy-actions"><button className="secondary" disabled={busy||!status.workerOnline} onClick={()=>void run({action:'disconnect'})}>Confirmar desconexão</button><button className="secondary" disabled={busy} onClick={()=>setConfirmDisconnect(false)}>Cancelar</button></div></div>:<button className="secondary" disabled={busy||!status.workerOnline} onClick={()=>setConfirmDisconnect(true)}><Unplug size={15}/> Desconectar conta</button>}</div>}
  </section>
  {status?.status==='connected'&&<section className="settings-card"><h2>Canais acessíveis</h2><p>Liste os canais e supergrupos que sua conta já pode acessar. Selecione até dez. O teste exige um canal administrado pela conta.</p><button className="secondary" disabled={busy} onClick={()=>void run({action:'channels'})}>Listar canais</button>
   {!!available.length&&<><div className={styles.channels}>{available.map(channel=><label className={styles.check} key={channel.id}><input type="checkbox" checked={selected.includes(channel.id)} disabled={busy||!selected.includes(channel.id)&&selected.length>=10} onChange={e=>setSelected(ids=>e.target.checked?[...ids,channel.id]:ids.filter(id=>id!==channel.id))}/><span><strong>{channel.title}</strong><small>{channel.controlled?'Administrador · disponível para teste':'Acessível · somente seleção nesta etapa'}</small></span></label>)}</div><div className="copy-actions"><button className="primary" disabled={busy} onClick={()=>void run({action:'select',ids:selected})}>Salvar seleção</button></div></>}
   {more&&<button className="secondary" disabled={busy} onClick={()=>void run({action:'channels',more:true})}>Carregar mais canais</button>}
   {!available.length&&<p className="fine-print muted">Use Listar canais para consultar as fontes disponíveis. Nenhum histórico será importado.</p>}
  </section>}
  <section className="settings-card"><h2><Radio size={20}/> Teste de recebimento</h2><p>Teste de dez minutos em uma fonte controlada. Publique uma nova mensagem pelo aplicativo oficial após iniciar. O diagnóstico mostra apenas ID, horário e tipo; texto, remetentes e arquivos não são guardados.</p>
   {operation==='dropou'&&<p className="fine-print muted">Links Shopee identificados nesta janela podem consumir a cota de importações para obter um link da nossa conta. Produtos repetidos usam o cache; nada será cadastrado ou publicado.</p>}
   {status?.status==='connected'&&<div className={styles.form}><label htmlFor={sourceId}>Fonte controlada</label><select id={sourceId} value={source} onChange={e=>{setSource(e.target.value);setControlled(false);}}><option value="">Selecione um canal salvo</option>{testSources.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><label className={styles.check}><input type="checkbox" checked={controlled} onChange={e=>setControlled(e.target.checked)}/>Confirmo que esta fonte é controlada por mim e será usada para este teste.</label><div className="copy-actions"><button className="primary" disabled={busy||!controlled||!source||!!status.test} onClick={()=>void run({action:'test',channelId:source,controlled:true})}>Iniciar teste</button><button className="secondary" disabled={busy||!status.test} onClick={()=>void run({action:'stop'})}>Encerrar e limpar diagnóstico</button></div></div>}
   {status?.test&&<p role="status">{status.workerOnline?'Aguardando novas mensagens':'Worker indisponível · recebimento interrompido'} · início {date(status.test.startedAt)} · até {date(status.test.expiresAt)}. Não há recuperação das mensagens de períodos offline.</p>}
   <p className="fine-print muted">Últimos 50 eventos, retidos por até uma hora. Nenhuma republicação é executada.</p>
   {status?.diagnostics.length?<ol className={styles.events} aria-label="Mensagens recebidas">{status.diagnostics.map(m=><li key={m.channel_id+':'+m.message_id}><strong>Mensagem #{m.message_id} · {m.kind}</strong><span>{available.find(c=>c.id===m.channel_id)?.title||'Fonte selecionada'}</span><small>Publicada {date(m.message_at)} · recebida {date(m.received_at)}</small></li>)}</ol>:<p role="status">Nenhuma nova mensagem recebida neste teste.</p>}
  </section>
  {operation==='dropou'&&status?.status==='connected'&&<TelegramShopeeTestQueue queue={status.shopee} eventsClassName={styles.events}/>}
 </div>;
}
