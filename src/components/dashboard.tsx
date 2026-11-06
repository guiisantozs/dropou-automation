'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bell,Check,Clipboard,Clock3,LayoutDashboard,Link2,ListOrdered,Package,Plus,Search,ShieldCheck,Sparkles,X,Zap} from 'lucide-react';
import {productKey,defaultSchedule,money,Product,Schedule,statuses} from '@/lib/domain';
import {emptyProduct,productEmoji} from '@/lib/product-draft';
import {api} from '@/lib/api';
import {BrandPreparation} from './brand-selector';
import WorkspaceSidebar from './workspace-sidebar';
import {WorkspaceBrandId} from '@/lib/workspace-brands';
import {clearPrivateImages} from '@/lib/private-image';
import {Offer,Publication} from '@/lib/offers';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
const ChannelFunnels=dynamic(()=>import('./channel-funnels'));
const PublicationSchedule=dynamic(()=>import('./publication-schedule'));
const AIUsage=dynamic(()=>import('./ai-usage'));
const SearchOffers=dynamic(()=>import('./search-offers'));
const MercadoLivreConnection=dynamic(()=>import('./mercado-livre-connection'));
const IntegrationStatusPanel=dynamic(()=>import('./integration-status'));
import DashboardOverview,{WorkspaceSkeleton} from './dashboard-overview';
const ProductDetails=dynamic(()=>import('./product-details'));
import CaptionContent from './caption-content';

import {live,supabase} from '@/lib/supabase';
type View='Visão geral'|'Buscar ofertas'|'Catálogo de produtos'|'Fila de ofertas'|'Agendamento'|'Integrações'|'Logs de atividade'|'Consumo de IA';
type Log={event:string;detail:string;created_at:string};
export default function Dashboard({initialView='Visão geral'}:{initialView?:View}){
 const router=useRouter();
 const [workspaceBrand,setWorkspaceBrand]=useState<WorkspaceBrandId>('dropou');
 function setEditing(p:Product|null){if(p)router.push('/ofertas/'+p.id+'/editar');}
 function setPreview(p:Product|null){if(p)router.push('/ofertas/'+p.id);}
 const [view,setView]=useState<View>(initialView),[products,setProducts]=useState<Product[]>([]),[schedule]=useState<Schedule>(defaultSchedule),[logs,setLogs]=useState<Log[]>([]),[loaded,setLoaded]=useState(false),[user,setUser]=useState<string|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [toast,setToast]=useState(''),[archivedCatalog,setArchivedCatalog]=useState(false);
 const csv=useRef<HTMLInputElement>(null), activeUser=useRef<string|null>(null);
 const [offers,setOffers]=useState<Offer[]>([]),[publications,setPublications]=useState<Publication[]>([]),[workspaceError,setWorkspaceError]=useState('');
 const [page,setPage]=useState(0),[historyPage,setHistoryPage]=useState(0),[more,setMore]=useState(false),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState(''),[catalogQuery,setCatalogQuery]=useState(''),[total,setTotal]=useState(0),[summary,setSummary]=useState<{products:number;published:number;scheduled:number;waiting:number}>();
 const refreshSequence=useRef(0);
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);setQuery(catalogQuery);},250);return()=>clearTimeout(timer);},[catalogQuery]);
 const [details,setDetails]=useState<Product|null>(null);
 async function refresh(){
  const expected=activeUser.current;if(!expected)return;const sequence=++refreshSequence.current;
  const data=await api<{products:Product[];offers:Offer[];publications:Publication[];logs:Log[];summary:typeof summary;total:number;more:boolean;historyMore:boolean}>('/api/workspace?page='+page+'&q='+encodeURIComponent(query)+'&history='+(view==='Logs de atividade')+'&historyPage='+historyPage+'&archived='+(view==='Catálogo de produtos'&&archivedCatalog));
  if(activeUser.current!==expected||sequence!==refreshSequence.current)return;
  setProducts(data.products);setOffers(data.offers);setPublications(data.publications);setLogs(data.logs);setWorkspaceError('');setSummary(data.summary);setTotal(data.total);setMore(data.more);setHistoryMore(data.historyMore);
 }
 useEffect(()=>{
  if(!supabase){setWorkspaceError('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local, aplique o schema e reinicie a aplicação.');setLoaded(true);return;}
  const update=(id:string|null)=>{if(activeUser.current!==id){clearPrivateImages();setDetails(null);activeUser.current=id;setProducts([]);setOffers([]);setPublications([]);setLogs([]);setPreview(null);setEditing(null);setLoaded(false);}setUser(id);};
  supabase.auth.getSession().then(({data,error})=>{if(error)setWorkspaceError('Não foi possível verificar a sessão.');update(data.session?.user.id||null);});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>update(session?.user.id||null));return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(!user)return;let cancelled=false;refresh().catch(e=>{if(!cancelled)setWorkspaceError((e as Error).message);}).finally(()=>{if(!cancelled)setLoaded(true);});return()=>{cancelled=true;};},[user,page,query,historyPage,view==='Logs de atividade',view==='Catálogo de produtos'&&archivedCatalog]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('view')==='ai')setView('Consumo de IA');if(new URLSearchParams(window.location.search).get('mercado_livre')==='connected'){setView('Integrações');setToast('Autorização recebida. Use Testar integrações para validar a conta e a busca.');window.history.replaceState(null,'',window.location.pathname);}},[]);
 async function persist(p:Product){const {product}=await api<{product:Product}>('/api/products','POST',p);return product;}
 function newProduct(){router.push('/ofertas/nova');}
 async function upload(file?:File){if(!file)return;let count=0;try{
  if(file.size>2_000_000)throw new Error('O CSV deve ter até 2 MB.');
  const {importCsv}=await import('@/lib/csv');const result=importCsv(await file.text(),products);for(const p of result.products){await persist(p);count++;}await refresh();
  setToast(`${count} produtos salvos. ${result.errors.slice(0,3).join(' · ')}`);
 }catch(e){if(count)await refresh().catch(()=>{});setToast(`${count} salvos antes da falha. ${(e as Error).message}`);}if(csv.current)csv.current.value='';}
 const confirmedPublications=publications.filter(p=>!p.review_required&&!!p.confirmed_by),reviewPublications=publications.filter(p=>p.review_required||!p.confirmed_by);
 const queuedProducts=products.filter(p=>p.store==='Mercado Livre'&&offers.some(o=>o.product_id===p.id));
 const nav:[View,typeof Package][]=[['Visão geral',LayoutDashboard],['Buscar ofertas',Search],['Catálogo de produtos',Package],['Fila de ofertas',ListOrdered],['Agendamento',Clock3],['Integrações',Link2],['Logs de atividade',Clipboard],['Consumo de IA',Sparkles]];
 if(live&&!user)return <main className="login"><div className="login-card"><div className="brand"><span className="brand-icon"><Zap/></span>dropou<span className="brand-dot">.</span></div><h1>Sua central de ofertas</h1><p>{supabase?'Entre com um usuário criado no Supabase Auth.':'Supabase ainda não configurado. O catálogo real depende da conexão com o banco.'}</p>{workspaceError&&<p role="alert">{workspaceError}</p>}<form onSubmit={async e=>{e.preventDefault();const r=await supabase?.auth.signInWithPassword({email,password});if(r?.error)setToast('Não foi possível entrar. Verifique email e senha.');}}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={!supabase}>Entrar <ArrowUpRight size={16}/></button></form><p role="status">{toast}</p></div></main>;
 return <div className="app-shell">
  <WorkspaceSidebar brand={workspaceBrand} onBrand={setWorkspaceBrand} active={view} items={nav.map(([id,icon])=>({id,icon,label:({'Visão geral':'Dashboard','Catálogo de produtos':'Catálogo','Fila de ofertas':'Publicações','Agendamento':'Agendamentos','Integrações':'Configurações'} as Partial<Record<View,string>>)[id]||id,count:id==='Fila de ofertas'?offers.filter(o=>o.status!=='publicado').length:undefined}))} onNavigate={id=>{setWorkspaceBrand('dropou');setView(id as View);}} onCreate={newProduct} onHelp={()=>{setView('Integrações');setToast('Consulte também o README para configurar a produção.');}} onSignOut={live?()=>{void supabase?.auth.signOut();}:undefined}/>
  <div className="main-shell"><header className="topbar"><button className="topbar-search" onClick={()=>{setWorkspaceBrand('dropou');setView('Catálogo de produtos');}}><Search size={19}/><span>Buscar produtos no catálogo…</span><ArrowUpRight size={15}/></button><div className="topbar-right"><span className="mode-pill"><span/>{workspaceError?'Banco indisponível':loaded?'Supabase conectado':'Verificando banco'}</span><button aria-label="Ver logs" onClick={()=>setView('Logs de atividade')}><Bell size={19}/></button><span className="avatar">DP</span></div></header>
  <main className="content">{workspaceBrand!=='dropou'?<BrandPreparation brand={workspaceBrand} onReturn={()=>setWorkspaceBrand('dropou')}/>:<>{workspaceError&&<div className="section-note" role="alert">{workspaceError}<button className="secondary" onClick={()=>refresh().catch(e=>setWorkspaceError((e as Error).message))}>Tentar novamente</button></div>}{!loaded&&<WorkspaceSkeleton/>}<div className="page-heading"><div><div className="eyebrow">SUA CENTRAL DE OPORTUNIDADES</div><h1>{view==='Visão geral'?'Dashboard':view}</h1><p>{view==='Visão geral'?'Gerencie suas ofertas, publicações e integrações em um só lugar.':'Organize sua operação e acompanhe cada publicação.'}</p></div><button className="primary" onClick={newProduct}><Plus size={18}/>Criar nova oferta</button></div>
  {loaded&&!workspaceError&&view==='Buscar ofertas'&&<SearchOffers products={products} offers={offers} onRefresh={refresh} onEdit={setEditing} onPreview={setPreview}/>}
  {loaded&&!workspaceError&&(view==='Visão geral'||view==='Catálogo de produtos')&&<>
   <DashboardOverview onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} archived={view==='Catálogo de produtos'&&archivedCatalog} onArchived={view==='Catálogo de produtos'?value=>{setPage(0);setArchivedCatalog(value);}:undefined} offers={offers} activity={logs} products={products} publications={publications} summary={summary} catalogQuery={catalogQuery} onCatalogQuery={setCatalogQuery} overview={view==='Visão geral'} onCreate={newProduct} onOpen={setDetails} onPreview={setPreview} onImport={()=>csv.current?.click()} onNavigate={setView}/>
  </>}
  {(view==='Visão geral'||view==='Fila de ofertas')&&<ChannelFunnels/>}
  {view==='Consumo de IA'&&<AIUsage products={products} onRefresh={refresh}/>}
  {view==='Agendamento'&&<PublicationSchedule/>}
  {view==='Integrações'&&<div className="integration-grid"><IntegrationStatusPanel/>{[['Mercado Livre','Links oficiais, controle manual','Cole no produto o link criado no Portal de Afiliados. O sistema valida o domínio, mas não comprova a titularidade do link. A busca via API depende de autorização.'],['WhatsApp Channels','Publicação manual','Abra uma oferta, copie a legenda e o link. Publique no canal e registre a publicação. Nenhum endpoint não oficial é utilizado.'],['Telegram','Bot API · servidor','Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (ou TELEGRAM_CHANNEL_ID), conceda permissão de postagem e confirme o canal na oferta. Conferência humana atual é aceita quando a API autorizada não pode revalidar.']].map(([title,subtitle,body])=><section className="settings-card integration" key={title}><span className="integration-symbol"><Link2 size={24}/></span><h2>{title}</h2><span className="badge neutral">{subtitle}</span><p>{body}</p>{title==='Mercado Livre'&&<MercadoLivreConnection/>}</section>)}</div>}
  {view==='Logs de atividade'&&<><section className="catalog" style={{marginBottom:20}}><div className="catalog-heading"><h2>Publicações confirmadas manualmente no WhatsApp · {confirmedPublications.length}</h2></div>{!!reviewPublications.length&&<p className="section-note notice-warning">{reviewPublications.length} registro(s) antigo(s) aguardam revisão e não são contabilizados como confirmação manual.</p>}{!confirmedPublications.length?<div className="empty"><p>Nenhuma publicação manual confirmada.</p></div>:<div className="logs-list">{confirmedPublications.map(p=><div key={p.id}><div><b>{p.snapshot.name}</b><p>{new Date(p.published_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</p><details><summary>Ver legenda publicada</summary><CaptionContent text={p.caption}/></details></div></div>)}</div>}</section><section className="catalog"><div className="catalog-heading"><div><h2>Histórico da operação</h2><p>Cadastros, mudanças de estado e execução das integrações.</p></div></div>{!logs.length?<div className="empty"><Clipboard size={28}/><p>As próximas ações aparecerão aqui.</p></div>:<div className="logs-list">{logs.map((l,i)=><div key={i}><span className="log-icon"><Check size={16}/></span><div><b>{l.event}</b><p>{l.detail}</p></div><time>{new Date(l.created_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</time></div>)}</div>}</section></>}
  {(view==='Visão geral'||view==='Catálogo de produtos'||view==='Fila de ofertas')&&<div className="table-footer"><span>{total} produtos no resultado · página {page+1} · até 24 por página</span><div className="copy-actions"><button className="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Página anterior</button><button className="secondary" disabled={!more} onClick={()=>setPage(p=>p+1)}>Próxima página</button></div></div>}
  {view==='Logs de atividade'&&<div className="table-footer"><span>Página {historyPage+1} do histórico · até 20 por lista</span><div className="copy-actions"><button className="secondary" disabled={!historyPage} onClick={()=>setHistoryPage(p=>p-1)}>Histórico anterior</button><button className="secondary" disabled={!historyMore} onClick={()=>setHistoryPage(p=>p+1)}>Mais histórico</button></div></div>}
  <footer className="page-footer"><span><Zap size={13}/> DROPOU AUTOMAÇÃO</span><span>Curadoria inteligente. Economia de verdade.</span></footer></>}</main></div>
  <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={e=>upload(e.target.files?.[0])}/>
  {details&&<ProductDetails archived={view==='Catálogo de produtos'&&archivedCatalog} onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} product={details} offer={offers.find(o=>o.product_id===details.id)} publications={publications} onClose={()=>setDetails(null)} onEdit={()=>{setEditing(details);setDetails(null);}} onPreview={()=>{setPreview(details);setDetails(null);}}/>}
  {toast&&<div className="toast" role="status"><span>{toast}</span><button aria-label="Dispensar" onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div>;
}
function Status({value}:{value:Product['status']}){return <span className={`badge status-${value.replaceAll(' ','-')}`}><span/>{value==='aguardando link'?'Aguardando link':value[0].toUpperCase()+value.slice(1)}</span>;}
