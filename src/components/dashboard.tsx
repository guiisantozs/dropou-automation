'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bell,BookmarkPlus,Check,Clipboard,Clock3,LayoutDashboard,Link2,ListOrdered,Package,Plus,Search,ShieldCheck,Sparkles,X,Zap} from 'lucide-react';
import {productKey,defaultSchedule,money,Product,Schedule,statuses} from '@/lib/domain';
import {emptyProduct,productEmoji} from '@/lib/product-draft';
import {api} from '@/lib/api';
import OperationSettingsPanel from './operation-settings';
import OperationLinks from './operation-links';
import PublicationHistory from './publication-history';
import WorkspaceSidebar from './workspace-sidebar';
import {WorkspaceBrandId,selectedOperation,selectOperation,operationName} from '@/lib/workspace-brands';
import {clearPrivateImages} from '@/lib/private-image';
import {Offer,Publication} from '@/lib/offers';
import type {ProductChannelSummary} from '@/lib/channel-state';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
const ProductOperations=dynamic(()=>import('./product-operations'));
const ChannelFunnels=dynamic(()=>import('./channel-funnels'));
const PublicationSchedule=dynamic(()=>import('./publication-schedule'));
const AIUsage=dynamic(()=>import('./ai-usage'));
const SearchOffers=dynamic(()=>import('./search-offers'));
const OfferAutomation=dynamic(()=>import('./offer-automation'));
const NextPosts=dynamic(()=>import('./next-posts'));
const ShopeeSavedProducts=dynamic(()=>import('./shopee-saved-products'));
const MercadoLivreConnection=dynamic(()=>import('./mercado-livre-connection'));
const IntegrationStatusPanel=dynamic(()=>import('./integration-status'));
import DashboardOverview,{WorkspaceSkeleton} from './dashboard-overview';
const ProductDetails=dynamic(()=>import('./product-details'));
import CaptionContent from './caption-content';

import {live,supabase} from '@/lib/supabase';
type View='Curadoria'|'Visão geral'|'Buscar ofertas'|'Meus links Shopee'|'Automação de Ofertas'|'Próximos posts'|'Catálogo de produtos'|'Fila de ofertas'|'Agendamento'|'Integrações'|'Logs de atividade'|'Consumo de IA';
type Log={event:string;detail:string;created_at:string};
export default function Dashboard({initialView='Visão geral'}:{initialView?:View}){
 const router=useRouter();
 const [approvedProduct,setApprovedProduct]=useState<string>();
 const [curation,setCuration]=useState<{pending:number;approved:number;rejected:number}|null>(null);
 const [brandNames,setBrandNames]=useState<Partial<Record<WorkspaceBrandId,string>>>({});
 async function refreshNames(){const r=await api<{operations:{brand_id:WorkspaceBrandId;display_name:string}[]}>('/api/operations?summary=true');setBrandNames(Object.fromEntries(r.operations.map(s=>[s.brand_id,s.display_name])));}
 const [workspaceBrand,setWorkspaceBrand]=useState<WorkspaceBrandId>('dropou');
 useEffect(()=>{const brand=selectedOperation();selectOperation(brand);setWorkspaceBrand(brand);},[]);
 function changeBrand(brand:WorkspaceBrandId){if(brand!=='dropou'&&view==='Curadoria')setView('Visão geral');refreshSequence.current++;selectOperation(brand);setWorkspaceBrand(brand);setProducts([]);setCuration(null);setOffers([]);setPublications([]);setLogs([]);setSummary(undefined);setDetails(null);setChannelStatus({});setAutomation(null);setLoaded(false);setPage(0);setHistoryPage(0);setCatalogQuery('');setQuery('');setWorkspaceError('');clearPrivateImages();}

 function setEditing(p:Product|null){if(p)router.push('/ofertas/'+p.id+'/editar?brand='+(p.operation||'dropou'));}
 function setPreview(p:Product|null){if(p)router.push('/ofertas/'+p.id+'?brand='+(p.operation||'dropou'));}
 const [view,setView]=useState<View>(initialView),[products,setProducts]=useState<Product[]>([]),[schedule]=useState<Schedule>(defaultSchedule),[logs,setLogs]=useState<Log[]>([]),[loaded,setLoaded]=useState(false),[user,setUser]=useState<string|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [automation,setAutomation]=useState<boolean|null>(null);
 const [channelStatus,setChannelStatus]=useState<Record<string,ProductChannelSummary>>({});
 const [toast,setToast]=useState(''),[archivedCatalog,setArchivedCatalog]=useState(false);
 const csv=useRef<HTMLInputElement>(null), activeUser=useRef<string|null>(null);
 const [offers,setOffers]=useState<Offer[]>([]),[publications,setPublications]=useState<Publication[]>([]),[workspaceError,setWorkspaceError]=useState('');
 const [page,setPage]=useState(0),[historyPage,setHistoryPage]=useState(0),[more,setMore]=useState(false),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState(''),[catalogQuery,setCatalogQuery]=useState(''),[total,setTotal]=useState(0),[summary,setSummary]=useState<{products:number;published:number;scheduled:number;waiting:number}>();
 const refreshSequence=useRef(0);
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);setQuery(catalogQuery);},250);return()=>clearTimeout(timer);},[catalogQuery]);
 const [details,setDetails]=useState<Product|null>(null);
 async function refresh(){
  if(workspaceBrand==='dropou'&&['Visão geral','Curadoria','Catálogo de produtos','Próximos posts'].includes(view))return;
  const expected=activeUser.current;if(!expected)return;const sequence=++refreshSequence.current;
  const data=await api<{curation:{pending:number;approved:number;rejected:number}|null;products:Product[];channelStatus:Record<string,ProductChannelSummary>;automation:boolean|null;offers:Offer[];publications:Publication[];logs:Log[];summary:typeof summary;total:number;more:boolean;historyMore:boolean}>('/api/workspace?page='+page+'&q='+encodeURIComponent(query)+'&history='+(view==='Logs de atividade')+'&historyPage='+historyPage+'&archived='+(view==='Catálogo de produtos'&&archivedCatalog));
  if(activeUser.current!==expected||sequence!==refreshSequence.current)return;
  setCuration(data.curation);setProducts(data.products);setChannelStatus(data.channelStatus);setAutomation(data.automation);setOffers(data.offers);setPublications(data.publications);setLogs(data.logs);setWorkspaceError('');setSummary(data.summary);setTotal(data.total);setMore(data.more);setHistoryMore(data.historyMore);
 }
 useEffect(()=>{
  if(!supabase){setWorkspaceError('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local, aplique o schema e reinicie a aplicação.');setLoaded(true);return;}
  const update=(id:string|null)=>{if(activeUser.current!==id){clearPrivateImages();setDetails(null);activeUser.current=id;setProducts([]);setChannelStatus({});setAutomation(null);setOffers([]);setPublications([]);setLogs([]);setPreview(null);setEditing(null);setLoaded(false);}setUser(id);};
  supabase.auth.getSession().then(({data,error})=>{if(error)setWorkspaceError('Não foi possível verificar a sessão.');update(data.session?.user.id||null);});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>update(session?.user.id||null));return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(user)void refreshNames().catch(()=>{});},[user]);
 useEffect(()=>{if(!user)return;let cancelled=false;refresh().catch(e=>{if(!cancelled)setWorkspaceError((e as Error).message);}).finally(()=>{if(!cancelled)setLoaded(true);});return()=>{cancelled=true;};},[workspaceBrand,user,page,query,historyPage,view==='Curadoria',view==='Logs de atividade',view==='Catálogo de produtos'&&archivedCatalog]);
 useEffect(()=>{if(!user)return;const update=()=>{if(document.visibilityState==='visible')void refresh().catch(e=>setWorkspaceError((e as Error).message));};window.addEventListener('focus',update);const timer=setInterval(update,30000);return()=>{window.removeEventListener('focus',update);clearInterval(timer);};},[workspaceBrand,user,page,query,historyPage,view,archivedCatalog]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('view')==='catalog')setView('Catálogo de produtos');if(new URLSearchParams(window.location.search).get('view')==='curation')setView('Curadoria');if(new URLSearchParams(window.location.search).get('view')==='shopee-saved')setView('Meus links Shopee');if(new URLSearchParams(window.location.search).get('view')==='posts')setView('Próximos posts');if(new URLSearchParams(window.location.search).get('view')==='automation')setView('Automação de Ofertas');if(new URLSearchParams(window.location.search).get('view')==='ai')setView('Consumo de IA');if(new URLSearchParams(window.location.search).get('mercado_livre')==='connected'){setView('Integrações');setToast('Autorização recebida. Use Testar integrações para validar a conta e a busca.');window.history.replaceState(null,'',window.location.pathname);}},[]);
 async function persist(p:Product){const {product}=await api<{product:Product}>('/api/products','POST',p);return product;}
 function newProduct(){if(workspaceBrand==='all'){setToast('Selecione uma marca antes de criar uma oferta.');return;}router.push('/ofertas/nova?brand='+workspaceBrand);}
 async function upload(file?:File){if(!file)return;let count=0;try{if(workspaceBrand==='all')throw new Error('Selecione uma marca para importar.');
  if(file.size>2_000_000)throw new Error('O CSV deve ter até 2 MB.');
  const {importCsv}=await import('@/lib/csv');const result=importCsv(await file.text(),products);for(const p of result.products){await persist({...p,operation:workspaceBrand});count++;}await refresh();
  setToast(`${count} produtos salvos. ${result.errors.slice(0,3).join(' · ')}`);
 }catch(e){if(count)await refresh().catch(()=>{});setToast(`${count} salvos antes da falha. ${(e as Error).message}`);}if(csv.current)csv.current.value='';}
 const confirmedPublications=publications.filter(p=>!p.review_required&&!!p.confirmed_by),reviewPublications=publications.filter(p=>p.review_required||!p.confirmed_by);
 const queuedProducts=products.filter(p=>offers.some(o=>o.product_id===p.id));
 const nav:[View,typeof Package][]=[['Visão geral',LayoutDashboard],['Curadoria',ShieldCheck],['Buscar ofertas',Search],['Meus links Shopee',BookmarkPlus],['Automação de Ofertas',Zap],['Próximos posts',Clock3],['Catálogo de produtos',Package],['Fila de ofertas',ListOrdered],['Agendamento',Clock3],['Integrações',Link2],['Logs de atividade',Clipboard],['Consumo de IA',Sparkles]];
 if(live&&!user)return <main className="login"><div className="login-card"><div className="brand"><span className="brand-icon"><Zap/></span>dropou<span className="brand-dot">.</span></div><h1>Sua central de ofertas</h1><p>{supabase?'Entre com um usuário criado no Supabase Auth.':'Supabase ainda não configurado. O catálogo real depende da conexão com o banco.'}</p>{workspaceError&&<p role="alert">{workspaceError}</p>}<form onSubmit={async e=>{e.preventDefault();const r=await supabase?.auth.signInWithPassword({email,password});if(r?.error)setToast('Não foi possível entrar. Verifique email e senha.');}}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={!supabase}>Entrar <ArrowUpRight size={16}/></button></form><p role="status">{toast}</p></div></main>;
 return <div className="app-shell" data-operation={workspaceBrand}>
  <WorkspaceSidebar names={brandNames} brand={workspaceBrand} onBrand={changeBrand} active={view} items={nav.filter(([id])=>id!=='Curadoria'||workspaceBrand==='dropou').map(([id,icon])=>({id,icon,label:({'Visão geral':'Dashboard','Automação de Ofertas':'Rotina Shopee','Catálogo de produtos':'Catálogo','Fila de ofertas':'Publicações','Agendamento':'Agendamentos','Integrações':'Configurações'} as Partial<Record<View,string>>)[id]||id,count:id==='Fila de ofertas'?offers.filter(o=>o.status!=='publicado').length:undefined}))} onNavigate={id=>{setView(id as View);const url=new URL(window.location.href),key=({'Catálogo de produtos':'catalog','Curadoria':'curation','Meus links Shopee':'shopee-saved','Próximos posts':'posts','Automação de Ofertas':'automation','Consumo de IA':'ai'} as Record<string,string>)[id];if(key)url.searchParams.set('view',key);else url.searchParams.delete('view');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}} onCreate={newProduct} onHelp={()=>{setView('Integrações');setToast('Consulte também o README para configurar a produção.');}} onSignOut={live?()=>{void supabase?.auth.signOut();}:undefined}/>
  <div className="main-shell"><header className="topbar"><button className="topbar-search" onClick={()=>{setView('Catálogo de produtos');}}><Search size={19}/><span>Buscar produtos no catálogo…</span><ArrowUpRight size={15}/></button><div className="topbar-right"><span className="mode-pill"><span/>{workspaceError?'Banco indisponível':loaded?'Supabase conectado':'Verificando banco'}</span><button aria-label="Ver logs" onClick={()=>setView('Logs de atividade')}><Bell size={19}/></button><span className="avatar">DP</span></div></header>
  <main className="content">{<>{workspaceError&&<div className="section-note" role="alert">{workspaceError}<button className="secondary" onClick={()=>refresh().catch(e=>setWorkspaceError((e as Error).message))}>Tentar novamente</button></div>}{!loaded&&<WorkspaceSkeleton/>}<div className="page-heading"><div><div className="eyebrow">{(brandNames[workspaceBrand]||operationName(workspaceBrand)).toUpperCase()}</div><h1>{view==='Visão geral'?'Dashboard':view}</h1><p>{view==='Visão geral'?'Gerencie suas ofertas, publicações e integrações em um só lugar.':'Organize sua operação e acompanhe cada publicação.'}</p></div><button className="primary" onClick={newProduct}><Plus size={18}/>Criar nova oferta</button></div>
  {loaded&&!workspaceError&&view==='Buscar ofertas'&&<><OperationLinks operation={workspaceBrand}/>{workspaceBrand==='dropou'?<SearchOffers key={workspaceBrand} products={products} offers={offers} onRefresh={refresh} onEdit={setEditing} onPreview={setPreview}/>:<p className="section-note">Use os links e prints desta marca para cadastrar. A busca automática por nicho ficará para a integração oficial do Radar.</p>}</>}
  {workspaceBrand!=='dropou'&&loaded&&!workspaceError&&(view==='Visão geral'||view==='Catálogo de produtos')&&<>
   <DashboardOverview curation={curation} key={workspaceBrand} displayName={brandNames[workspaceBrand]} operation={workspaceBrand} automation={automation} channelStatus={channelStatus} onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} archived={view==='Catálogo de produtos'&&archivedCatalog} onArchived={view==='Catálogo de produtos'?value=>{setPage(0);setArchivedCatalog(value);}:undefined} offers={offers} activity={logs} products={products} publications={publications} summary={summary} catalogQuery={catalogQuery} onCatalogQuery={setCatalogQuery} overview={view==='Visão geral'} onCreate={newProduct} onOpen={setDetails} onPreview={setPreview} onImport={()=>csv.current?.click()} onNavigate={setView}/>
  </>}
  {workspaceBrand!=='dropou'&&(view==='Visão geral'||view==='Fila de ofertas')&&<ChannelFunnels key={workspaceBrand}/>}
  {view==='Fila de ofertas'&&<PublicationHistory key={workspaceBrand} operation={workspaceBrand} initiallyOpen/>}
  {view==='Consumo de IA'&&<AIUsage operation={workspaceBrand} key={workspaceBrand} products={products} onRefresh={refresh}/>}
  {view==='Agendamento'&&<PublicationSchedule key={workspaceBrand}/>}
  {view==='Automação de Ofertas'&&<OfferAutomation key={workspaceBrand} operation={workspaceBrand} onApproved={id=>{setApprovedProduct(id);setView('Próximos posts');void refresh().catch(e=>setWorkspaceError(e.message));window.history.replaceState(null,'','/?brand='+workspaceBrand+'&view=posts');}}/>}
  {workspaceBrand!=='dropou'&&view==='Próximos posts'&&<NextPosts key={workspaceBrand} operation={workspaceBrand} products={products} offers={offers} channels={channelStatus} highlight={approvedProduct} onOpen={(id,intent,brand)=>router.push('/ofertas/'+id+'?brand='+brand+(intent==='preview'?'':'&action='+intent))}/>}
  {workspaceBrand==='dropou'&&['Visão geral','Curadoria','Catálogo de produtos','Próximos posts'].includes(view)&&<ProductOperations key={view} mode={view==='Curadoria'?'curation':view==='Catálogo de produtos'?'catalog':view==='Próximos posts'?'approved':'dashboard'} onNavigate={id=>{setView(id as View);const key=({'Curadoria':'curation','Próximos posts':'posts','Catálogo de produtos':'catalog'} as Record<string,string>)[id];if(key)window.history.replaceState(null,'','/?brand=dropou&view='+key);}} onOpen={(id,intent)=>router.push('/ofertas/'+id+(intent==='edit'?'/editar':'')+'?brand=dropou'+(['schedule','telegram'].includes(intent)?'&action='+intent:''))}/>}
  {view==='Meus links Shopee'&&<ShopeeSavedProducts key={workspaceBrand} operation={workspaceBrand} onOpen={(id,intent)=>router.push('/ofertas/'+id+(intent==='edit'?'/editar':'')+'?brand=dropou&return=shopee-saved'+(['schedule','telegram'].includes(intent)?'&action='+intent:''))}/>}
  {view==='Integrações'&&<><OperationSettingsPanel key={workspaceBrand} operation={workspaceBrand} onSaved={()=>{void refreshNames();void refresh().catch(e=>setWorkspaceError(e.message));}}/><div className="integration-grid"><IntegrationStatusPanel key={workspaceBrand}/>{[['Mercado Livre','Links oficiais, controle manual','Cole no produto o link criado no Portal de Afiliados. O sistema valida o domínio, mas não comprova a titularidade do link. A busca via API depende de autorização.'],['WhatsApp Channels','Publicação manual','Abra uma oferta, copie a legenda e o link. Publique no canal e registre a publicação. Nenhum endpoint não oficial é utilizado.'],['Telegram','Bot API · servidor','Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (ou TELEGRAM_CHANNEL_ID), conceda permissão de postagem e confirme o canal na oferta. Conferência humana atual é aceita quando a API autorizada não pode revalidar.']].map(([title,subtitle,body])=><section className="settings-card integration" key={title}><span className="integration-symbol"><Link2 size={24}/></span><h2>{title}</h2><span className="badge neutral">{subtitle}</span><p>{body}</p>{title==='Mercado Livre'&&<MercadoLivreConnection/>}</section>)}</div></>}
  {view==='Logs de atividade'&&<><section className="catalog" style={{marginBottom:20}}><div className="catalog-heading"><h2>Publicações confirmadas manualmente no WhatsApp · {confirmedPublications.length}</h2></div>{!!reviewPublications.length&&<p className="section-note notice-warning">{reviewPublications.length} registro(s) antigo(s) aguardam revisão e não são contabilizados como confirmação manual.</p>}{!confirmedPublications.length?<div className="empty"><p>Nenhuma publicação manual confirmada.</p></div>:<div className="logs-list">{confirmedPublications.map(p=><div key={p.id}><div><b>{p.snapshot.name}</b><p>{new Date(p.published_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</p><details><summary>Ver legenda publicada</summary><CaptionContent text={p.caption}/></details></div></div>)}</div>}</section><section className="catalog"><div className="catalog-heading"><div><h2>Histórico da operação</h2><p>Cadastros, mudanças de estado e execução das integrações.</p></div></div>{!logs.length?<div className="empty"><Clipboard size={28}/><p>As próximas ações aparecerão aqui.</p></div>:<div className="logs-list">{logs.map((l,i)=><div key={i}><span className="log-icon"><Check size={16}/></span><div><b>{l.event}</b><p>{l.detail}</p></div><time>{new Date(l.created_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</time></div>)}</div>}</section></>}
  {workspaceBrand!=='dropou'&&(view==='Visão geral'||view==='Catálogo de produtos'||view==='Fila de ofertas')&&<div className="table-footer"><span>{total} produtos no resultado · página {page+1} · até 24 por página</span><div className="copy-actions"><button className="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Página anterior</button><button className="secondary" disabled={!more} onClick={()=>setPage(p=>p+1)}>Próxima página</button></div></div>}
  {view==='Logs de atividade'&&<div className="table-footer"><span>Página {historyPage+1} do histórico · até 20 por lista</span><div className="copy-actions"><button className="secondary" disabled={!historyPage} onClick={()=>setHistoryPage(p=>p-1)}>Histórico anterior</button><button className="secondary" disabled={!historyMore} onClick={()=>setHistoryPage(p=>p+1)}>Mais histórico</button></div></div>}
  <footer className="page-footer"><span><Zap size={13}/> DROPOU AUTOMAÇÃO</span><span>Curadoria inteligente. Economia de verdade.</span></footer></>}</main></div>
  <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={e=>upload(e.target.files?.[0])}/>
  {details&&<ProductDetails archived={view==='Catálogo de produtos'&&archivedCatalog} onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} product={details} offer={offers.find(o=>o.product_id===details.id)} publications={publications} onClose={()=>setDetails(null)} onEdit={()=>{setEditing(details);setDetails(null);}} onPreview={()=>{setPreview(details);setDetails(null);}}/>}
  {toast&&<div className="toast" role="status"><span>{toast}</span><button aria-label="Dispensar" onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div>;
}
function Status({value}:{value:Product['status']}){return <span className={`badge status-${value.replaceAll(' ','-')}`}><span/>{value==='aguardando link'?'Aguardando link':value[0].toUpperCase()+value.slice(1)}</span>;}
