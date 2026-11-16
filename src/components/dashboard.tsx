'use client';
import {usePublicationRefresh} from '@/lib/publication-sync';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bell,BookmarkPlus,Check,Clipboard,Clock3,LayoutDashboard,Link2,ListOrdered,Package,Plus,Search,ShieldCheck,Sparkles,X,Zap} from 'lucide-react';
import {productKey,defaultSchedule,money,Product,Schedule,statuses} from '@/lib/domain';
import {emptyProduct,productEmoji} from '@/lib/product-draft';
import {apiForOperation} from '@/lib/api';
import OperationSettingsPanel from './operation-settings';
import OperationLinks from './operation-links';
import PublicationsWorkspace from './publications-workspace';
import WorkspaceSidebar from './workspace-sidebar';
import ShopeeLibraryHeader from './shopee-library-header';
import WorkspacePageHeader from './workspace-page-header';
import {WorkspaceBrandId,isShopeeOperation,selectedOperation,selectOperation,operationName} from '@/lib/workspace-brands';
import {clearPrivateImages} from '@/lib/private-image';
import {Offer,Publication} from '@/lib/offers';
import type {ProductChannelSummary} from '@/lib/channel-state';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
import {WorkspaceState,useWorkspaceField,validPage,validText,validBoolean} from './workspace-state';
import WorkspaceLoading from './workspace-loading';
import {QuickOfferProvider,QuickOfferOutlet} from './quick-offer-context';
import type {QuickOfferTarget} from './quick-offer-context';
import WorkSurface from './work-surface';
import {workspaceBrands} from '@/lib/workspace-brands';
import {offerLocation,currentWorkspace,rememberWorkspaceScroll} from '@/lib/workspace-navigation';
const ProductOperations=dynamic(()=>import('./product-operations'),{loading:()=> <WorkspaceLoading/>});
const GeneralDashboard=dynamic(()=>import('./general-dashboard'),{loading:()=> <WorkspaceLoading/>});
const PublicationSchedule=dynamic(()=>import('./publication-schedule'),{loading:()=> <WorkspaceLoading/>});
const AIUsage=dynamic(()=>import('./ai-usage'));
const SearchOffers=dynamic(()=>import('./search-offers'));
const ShopeeTools=dynamic(()=>import('./shopee-tools'));
const TeamSettings=dynamic(()=>import('./team-settings'));
const OperatorActivity=dynamic(()=>import('./operator-activity'));
const ShopeeSavedProducts=dynamic(()=>import('./shopee-saved-products'),{loading:()=> <WorkspaceLoading/>});
const MercadoLivreConnection=dynamic(()=>import('./mercado-livre-connection'));
const MirroredOffers=dynamic(()=>import('./mirrored-offers'),{loading:()=> <WorkspaceLoading/>});
const TelegramConnections=dynamic(()=>import('./telegram-connections'),{loading:()=> <WorkspaceLoading/>});
const IntegrationStatusPanel=dynamic(()=>import('./integration-status'));
import DashboardOverview,{WorkspaceSkeleton} from './dashboard-overview';
const ProductDetails=dynamic(()=>import('./product-details'));
import CaptionContent from './caption-content';

import {live,supabase} from '@/lib/supabase';
type View='Curadoria'|'Visão geral'|'Buscar ofertas'|'Meus links Shopee'|'Automação de Ofertas'|'Próximos posts'|'Catálogo de produtos'|'Fila de ofertas'|'Agendamento'|'Integrações'|'Logs de atividade'|'Consumo de IA'|'Conexões Telegram'|'Ofertas espelhadas';
type Log={event:string;detail:string;created_at:string};
export default function Dashboard({initialView='Visão geral'}:{initialView?:View}){
 const router=useRouter();
 const [approvedProduct,setApprovedProduct]=useState<string>();
 const [choosingOperation,setChoosingOperation]=useState(false);
 const [savedQuery,setSavedQuery]=useState('');
 const quickOpen=useRef<((target:Omit<QuickOfferTarget,'operation'>&{operation:string})=>boolean)|null>(null);
 const [curation,setCuration]=useState<{pending:number;approved:number;rejected:number}|null>(null);
 const [allowedBrands,setAllowedBrands]=useState<WorkspaceBrandId[]>();
 const [isAdmin,setIsAdmin]=useState(false);
 const [brandNames,setBrandNames]=useState<Partial<Record<WorkspaceBrandId,string>>>({});
 async function refreshNames(){const r=await api<{access:{admin:boolean;brands:WorkspaceBrandId[]};operations:{brand_id:WorkspaceBrandId;display_name:string}[]}>('/api/operations?summary=true&brand=all');setBrandNames(Object.fromEntries(r.operations.map(s=>[s.brand_id,s.display_name])));setIsAdmin(r.access.admin);setAllowedBrands([...r.access.brands,...(r.access.admin?['all' as const]:[])]);if(!r.access.brands.includes(selectedOperation())&&selectedOperation()!=='all'||selectedOperation()==='all'&&!r.access.admin){const first=r.access.brands[0];if(first)changeBrand(first);}}
 const [workspaceBrand,setWorkspaceBrand]=useState<WorkspaceBrandId>('dropou');
 const api=apiForOperation(workspaceBrand),activeOperation=useRef<WorkspaceBrandId>('dropou');
 useEffect(()=>{const brand=selectedOperation();selectOperation(brand);activeOperation.current=brand;setWorkspaceBrand(brand);},[]);
 function changeBrand(brand:WorkspaceBrandId){if(!isShopeeOperation(brand)&&view==='Curadoria')setView('Visão geral');refreshSequence.current++;setApprovedProduct(undefined);selectOperation(brand);activeOperation.current=brand;setWorkspaceBrand(brand);setProducts([]);setCuration(null);setOffers([]);setPublications([]);setLogs([]);setSummary(undefined);setDetails(null);setChannelStatus({});setAutomation(null);setLoaded(false);setPage(0);setHistoryPage(0);setCatalogQuery('');setQuery('');setWorkspaceError('');clearPrivateImages();}

 function openOffer(id:string,brand:string,intent='preview',product?:Product){if(quickOpen.current?.({id,operation:brand,intent:intent as QuickOfferTarget['intent'],product:product||products.find(p=>p.id===id&&(p.operation||'dropou')===brand)}))return;rememberWorkspaceScroll();router.push(offerLocation(id,brand,intent,currentWorkspace()));}
 function setEditing(p:Product|null){if(p)openOffer(p.id,p.operation||'dropou','edit',p);}
 function setPreview(p:Product|null){if(p)openOffer(p.id,p.operation||'dropou','preview',p);}
 const [view,setRawView]=useState<View>(initialView==='Próximos posts'?'Agendamento':initialView),[products,setProducts]=useState<Product[]>([]),[schedule]=useState<Schedule>(defaultSchedule),[logs,setLogs]=useState<Log[]>([]),[loaded,setLoaded]=useState(false),[user,setUser]=useState<string|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [automation,setAutomation]=useState<boolean|null>(null);
 const [channelStatus,setChannelStatus]=useState<Record<string,ProductChannelSummary>>({});
 const [toast,setToast]=useState('');
 const [archivedCatalog,setArchivedCatalog,archiveReady]=useWorkspaceField(workspaceBrand+':legacy:archived',false,validBoolean,user),[page,setPage,pageReady]=useWorkspaceField(workspaceBrand+':legacy:page',0,validPage,user),[catalogQuery,setCatalogQuery,catalogReady]=useWorkspaceField(workspaceBrand+':legacy:query','',validText,user);
 const legacyReady=archiveReady&&pageReady&&catalogReady;
 const csv=useRef<HTMLInputElement>(null), activeUser=useRef<string|null>(null);
 const [offers,setOffers]=useState<Offer[]>([]),[publications,setPublications]=useState<Publication[]>([]),[workspaceError,setWorkspaceError]=useState('');
 const [historyPage,setHistoryPage]=useState(0),[more,setMore]=useState(false),[historyMore,setHistoryMore]=useState(false),[query,setQuery]=useState(''),[total,setTotal]=useState(0),[summary,setSummary]=useState<{products:number;published:number;scheduled:number;waiting:number}>();
 const refreshSequence=useRef(0);
 const lastCatalogQuery=useRef<{key:string;q:string}|undefined>(undefined);
 useEffect(()=>{if(!catalogReady)return;const key=user+':'+workspaceBrand,changed=lastCatalogQuery.current?.key===key&&lastCatalogQuery.current.q!==catalogQuery;lastCatalogQuery.current={key,q:catalogQuery};const timer=setTimeout(()=>{if(changed)setPage(0);setQuery(catalogQuery);},changed?250:0);return()=>clearTimeout(timer);},[catalogQuery,catalogReady,user,workspaceBrand]);
 const [details,setDetails]=useState<Product|null>(null);
 async function refresh(){
  if(!legacyReady||activeOperation.current!==workspaceBrand)return;
  if(view==='Conexões Telegram'||view==='Ofertas espelhadas')return;
  if(view==='Visão geral')return;
  if(isShopeeOperation(workspaceBrand)&&view==='Meus links Shopee')return;
  if(isShopeeOperation(workspaceBrand)&&['Visão geral','Curadoria','Catálogo de produtos'].includes(view))return;
  const expected=activeUser.current;if(!expected)return;const sequence=++refreshSequence.current;
  const data=await api<{curation:{pending:number;approved:number;rejected:number}|null;products:Product[];channelStatus:Record<string,ProductChannelSummary>;automation:boolean|null;offers:Offer[];publications:Publication[];logs:Log[];summary:typeof summary;total:number;more:boolean;historyMore:boolean}>('/api/workspace?page='+page+'&q='+encodeURIComponent(query)+'&history='+(view==='Logs de atividade')+'&historyPage='+historyPage+'&archived='+(view==='Catálogo de produtos'&&archivedCatalog));
  if(activeUser.current!==expected||sequence!==refreshSequence.current||activeOperation.current!==workspaceBrand)return;
  setCuration(data.curation);setProducts(data.products);setChannelStatus(data.channelStatus);setAutomation(data.automation);setOffers(data.offers);setPublications(data.publications);setLogs(data.logs);setWorkspaceError('');setSummary(data.summary);setTotal(data.total);setMore(data.more);setHistoryMore(data.historyMore);
 }
 useEffect(()=>{
  if(!supabase){setWorkspaceError('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local, aplique o schema e reinicie a aplicação.');setLoaded(true);return;}
  const update=(id:string|null)=>{if(activeUser.current!==id){clearPrivateImages();setDetails(null);activeUser.current=id;setProducts([]);setChannelStatus({});setAutomation(null);setOffers([]);setPublications([]);setLogs([]);setPreview(null);setEditing(null);setLoaded(false);}setUser(id);};
  supabase.auth.getSession().then(({data,error})=>{if(error)setWorkspaceError('Não foi possível verificar a sessão.');update(data.session?.user.id||null);});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>update(session?.user.id||null));return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(user)void refreshNames().catch(()=>{});},[user]);
 useEffect(()=>{if(!user||!legacyReady)return;let cancelled=false;refresh().catch(e=>{if(!cancelled)setWorkspaceError((e as Error).message);}).finally(()=>{if(!cancelled)setLoaded(true);});return()=>{cancelled=true;};},[workspaceBrand,user,legacyReady,page,query,historyPage,view,view==='Curadoria',view==='Logs de atividade',view==='Catálogo de produtos'&&archivedCatalog]);
 useEffect(()=>{if(!user)return;const update=()=>{if(document.visibilityState==='visible')void refresh().catch(e=>setWorkspaceError((e as Error).message));};window.addEventListener('focus',update);const timer=setInterval(update,30000);return()=>{window.removeEventListener('focus',update);clearInterval(timer);};},[workspaceBrand,user,page,query,historyPage,view,archivedCatalog]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
 const viewKeys:Partial<Record<View,string>>={'Visão geral':'dashboard','Agendamento':'schedule','Fila de ofertas':'publications','Catálogo de produtos':'catalog','Curadoria':'curation','Meus links Shopee':'shopee-saved','Automação de Ofertas':'automation','Consumo de IA':'ai','Buscar ofertas':'search','Integrações':'settings','Logs de atividade':'activity','Conexões Telegram':'telegram-connections','Ofertas espelhadas':'mirrored-offers'};
 function readView(){const key=new URLSearchParams(window.location.search).get('view');return (Object.entries(viewKeys).find(([,v])=>v===key)?.[0]||(['posts','schedules','agendamento'].includes(key||'')?'Agendamento':key==='queue'?'Fila de ofertas':initialView)) as View;}
 useEffect(()=>{const restore=()=>{setRawView(readView());const brand=selectedOperation();if(brand!==activeOperation.current)changeBrand(brand);};restore();window.addEventListener('popstate',restore);if(new URLSearchParams(window.location.search).get('mercado_livre')==='connected'){const url=new URL(window.location.href);url.searchParams.delete('mercado_livre');window.history.replaceState(window.history.state,'',url.pathname+url.search);setView('Integrações');setToast('Autorização recebida. Use Testar integrações para validar a conta e a busca.');}return()=>window.removeEventListener('popstate',restore);},[]);
 function setView(next:View){const normalized=next==='Próximos posts'?'Agendamento':next;setRawView(normalized);const url=new URL(window.location.href),key=viewKeys[normalized];if(key)url.searchParams.set('view',key);else url.searchParams.delete('view');window.history.replaceState(window.history.state,'',url.pathname+url.search);}
 async function persist(p:Product){const {product}=await api<{product:Product}>('/api/products','POST',p);return product;}
 function newProduct(){if(workspaceBrand==='all'){setChoosingOperation(true);return;}openOffer('nova',workspaceBrand);}
 async function upload(file?:File){if(!file)return;let count=0;try{if(workspaceBrand==='all')throw new Error('Selecione uma marca para importar.');
  if(file.size>2_000_000)throw new Error('O CSV deve ter até 2 MB.');
  const {importCsv}=await import('@/lib/csv');const result=importCsv(await file.text(),products);for(const p of result.products){await persist({...p,operation:workspaceBrand});count++;}await refresh();
  setToast(`${count} produtos salvos. ${result.errors.slice(0,3).join(' · ')}`);
 }catch(e){if(count)await refresh().catch(()=>{});setToast(`${count} salvos antes da falha. ${(e as Error).message}`);}if(csv.current)csv.current.value='';}
 const confirmedPublications=publications.filter(p=>!p.review_required&&!!p.confirmed_by),reviewPublications=publications.filter(p=>p.review_required||!p.confirmed_by);
 const queuedProducts=products.filter(p=>offers.some(o=>o.product_id===p.id));
 usePublicationRefresh(async()=>{if(user)await refresh();});
 const nav:[View,typeof Package][]=[['Visão geral',LayoutDashboard],['Curadoria',ShieldCheck],['Buscar ofertas',Search],['Meus links Shopee',BookmarkPlus],['Ofertas espelhadas',ListOrdered],['Automação de Ofertas',Zap],['Catálogo de produtos',Package],['Fila de ofertas',ListOrdered],['Agendamento',Clock3],['Integrações',Link2],...(isAdmin?[['Conexões Telegram',Link2] as [View,typeof Package]]:[]),['Logs de atividade',Clipboard],['Consumo de IA',Sparkles]];
 if(live&&!user)return <main className="login"><div className="login-card"><div className="brand"><span className="brand-icon"><Zap/></span>dropou<span className="brand-dot">.</span></div><h1>Sua central de ofertas</h1><p>{supabase?'Entre com um usuário criado no Supabase Auth.':'Supabase ainda não configurado. O catálogo real depende da conexão com o banco.'}</p>{workspaceError&&<p role="alert">{workspaceError}</p>}<form onSubmit={async e=>{e.preventDefault();const r=await supabase?.auth.signInWithPassword({email,password});if(r?.error)setToast('Não foi possível entrar. Verifique email e senha.');}}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={!supabase}>Entrar <ArrowUpRight size={16}/></button></form><p role="status">{toast}</p></div></main>;
 const savedLibrary=isShopeeOperation(workspaceBrand)&&view==='Meus links Shopee',generalView=workspaceBrand==='all'&&view==='Visão geral',operational=!generalView;
 return <WorkspaceState key={user} account={user}><QuickOfferProvider allowed={allowedBrands} bind={quickOpen}><div className={"app-shell"+(generalView?' general-workspace':' operational-workspace')+(savedLibrary&&operational?' operation-library-workspace':'')+(operational&&view==='Visão geral'?' operation-dashboard-shell':'')} data-operation={workspaceBrand}>
  <WorkspaceSidebar light={true} allowed={allowedBrands} names={brandNames} brand={workspaceBrand} onBrand={changeBrand} active={view} items={nav.filter(([id])=>id!=='Curadoria'||isShopeeOperation(workspaceBrand)||workspaceBrand==='all').map(([id,icon])=>({id,icon,label:({'Visão geral':'Dashboard','Automação de Ofertas':'Busca e consumo','Catálogo de produtos':'Catálogo','Fila de ofertas':'Publicações','Agendamento':'Agendamentos','Integrações':'Configurações','Consumo de IA':workspaceBrand==='all'?'Consumo de IA':'Legendas e IA'} as Partial<Record<View,string>>)[id]||id}))} onNavigate={id=>setView(id as View)} onCreate={newProduct} onHelp={()=>{setView('Integrações');setToast('Consulte também o README para configurar a produção.');}} onSignOut={live?()=>{void supabase?.auth.signOut();}:undefined}/>
  <div className="main-shell">{savedLibrary?<ShopeeLibraryHeader query={savedQuery} onQuery={setSavedQuery} onActivity={()=>setView('Logs de atividade')} onSettings={()=>setView('Integrações')} onSignOut={live?()=>{void supabase?.auth.signOut();}:undefined}/>:generalView?<header className="general-header"><div><h1>{view==='Visão geral'?'Todas as operações':view==='Agendamento'?'Agendamentos':view==='Fila de ofertas'?'Publicações':view}</h1><p>Acompanhe suas ofertas, publicações e canais em um só lugar.</p></div><div className="general-header-actions"><button className="general-create-button" onClick={newProduct}><Plus size={15}/><span>Criar oferta</span></button><button className="general-header-icon" aria-label="Buscar produtos no catálogo" title="Buscar no catálogo" onClick={()=>setView('Catálogo de produtos')}><Search size={19}/></button><button className="general-header-icon" aria-label="Notificações e atividade" title="Atividade recente" onClick={()=>setView('Logs de atividade')}><Bell size={19}/></button><details className="general-profile-menu"><summary aria-label="Perfil da conta" title="Perfil da conta">DP</summary><div><b>Conta Dropou</b><span>{isAdmin?'Administrador':'Verificando acesso'}</span><button onClick={()=>setView('Integrações')}>Configurações</button>{live&&<button onClick={()=>void supabase?.auth.signOut()}>Sair da conta</button>}</div></details></div></header>:<WorkspacePageHeader view={view} operation={workspaceBrand} displayName={brandNames[workspaceBrand]} onCreate={newProduct} onSearch={()=>setView('Catálogo de produtos')} onActivity={()=>setView('Logs de atividade')} onSettings={()=>setView('Integrações')} onSignOut={live?()=>{void supabase?.auth.signOut();}:undefined}/>}
  <main className="content">{<>{workspaceError&&<div className="section-note" role="alert">{workspaceError}<button className="secondary" onClick={()=>refresh().catch(e=>setWorkspaceError((e as Error).message))}>Tentar novamente</button></div>}{!loaded&&<WorkspaceSkeleton/>}

  {loaded&&!workspaceError&&view==='Buscar ofertas'&&<><OperationLinks key={'links:'+workspaceBrand} operation={workspaceBrand}/>{isShopeeOperation(workspaceBrand)?<ShopeeTools key={'tools:'+workspaceBrand} operation={workspaceBrand} onCurated={()=>setView('Curadoria')}/>:<p className="section-note">Use os links e prints desta marca para cadastrar. A busca automática por nicho ficará para a integração oficial do Radar.</p>}</>}
  {!isShopeeOperation(workspaceBrand)&&!(workspaceBrand==='all'&&view==='Visão geral')&&loaded&&!workspaceError&&view==='Catálogo de produtos'&&<>
   <DashboardOverview curation={curation} key={workspaceBrand} displayName={brandNames[workspaceBrand]} operation={workspaceBrand} automation={automation} channelStatus={channelStatus} onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} archived={view==='Catálogo de produtos'&&archivedCatalog} onArchived={view==='Catálogo de produtos'?value=>{setPage(0);setArchivedCatalog(value);}:undefined} offers={offers} activity={logs} products={products} publications={publications} summary={summary} catalogQuery={catalogQuery} onCatalogQuery={setCatalogQuery} overview={false} onCreate={newProduct} onOpen={setPreview} onPreview={setPreview} onImport={()=>csv.current?.click()} onNavigate={setView}/>
  </>}
  {loaded&&(workspaceBrand!=='all'||isAdmin)&&view==='Visão geral'&&<GeneralDashboard operation={workspaceBrand} key={(user||'anonymous')+':'+workspaceBrand} onNavigate={id=>setView(id==='Curadoria'&&!isShopeeOperation(workspaceBrand)&&workspaceBrand!=='all'?'Catálogo de produtos':id)} onCreate={newProduct} onMessage={setToast}/>}
  {workspaceBrand==='all'&&view==='Curadoria'&&<section className="general-panel general-operation-picker"><h2>Escolha uma operação para revisar</h2><p>As decisões de curadoria permanecem independentes por canal.</p><div>{workspaceBrands.filter(b=>isShopeeOperation(b.id)&&allowedBrands?.includes(b.id)).map(b=><button className="general-outline-button" key={b.id} onClick={()=>{changeBrand(b.id);setView('Curadoria');}}>{brandNames[b.id]||b.name}<ArrowUpRight size={14}/></button>)}</div></section>}

  {view==='Fila de ofertas'&&<PublicationsWorkspace key={workspaceBrand} operation={workspaceBrand}/>}
  {view==='Consumo de IA'&&<AIUsage operation={workspaceBrand} key={workspaceBrand} products={products} onRefresh={refresh}/>}
  {view==='Agendamento'&&<PublicationSchedule key={workspaceBrand} operation={workspaceBrand}/>}
  {view==='Automação de Ofertas'&&<ShopeeTools key={workspaceBrand} operation={workspaceBrand} onCurated={()=>setView('Curadoria')}/>}
  {isShopeeOperation(workspaceBrand)&&['Curadoria','Catálogo de produtos'].includes(view)&&<ProductOperations operation={isShopeeOperation(workspaceBrand)?workspaceBrand:'dropou'} key={workspaceBrand+view} mode={view==='Curadoria'?'curation':view==='Catálogo de produtos'?'catalog':view==='Próximos posts'?'approved':'dashboard'} onNavigate={id=>setView(id as View)} onOpen={(id,intent,product)=>openOffer(id,workspaceBrand,intent,product)}/>}
  {view==='Meus links Shopee'&&<ShopeeSavedProducts key={workspaceBrand} query={savedQuery} onClearSearch={()=>setSavedQuery('')} onSettings={()=>setView('Integrações')} onActivity={()=>setView('Logs de atividade')} operation={workspaceBrand} onOpen={(id,intent,product)=>openOffer(id,workspaceBrand,intent,product)}/>}
  {view==='Conexões Telegram'&&(isAdmin?<TelegramConnections key={workspaceBrand} operation={workspaceBrand}/>:<p>Somente administradores podem gerenciar conexões Telegram.</p>)}
  {view==='Ofertas espelhadas'&&<MirroredOffers key={workspaceBrand} operation={workspaceBrand}/>}
  {view==='Integrações'&&<>{isAdmin&&<TeamSettings/>}{isAdmin&&<OperationSettingsPanel key={workspaceBrand} operation={workspaceBrand} onSaved={()=>{void refreshNames();void refresh().catch(e=>setWorkspaceError(e.message));}}/>}<div className="integration-grid"><IntegrationStatusPanel key={workspaceBrand} operation={workspaceBrand}/>{[['Mercado Livre','Links oficiais, controle manual','Cole no produto o link criado no Portal de Afiliados. O sistema valida o domínio, mas não comprova a titularidade do link. A busca via API depende de autorização.'],['WhatsApp Channels','Publicação manual','Abra uma oferta, copie a legenda e o link. Publique no canal e registre a publicação. Nenhum endpoint não oficial é utilizado.'],['Telegram','Bot API · servidor','Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (ou TELEGRAM_CHANNEL_ID), conceda permissão de postagem e confirme o canal na oferta. Conferência humana atual é aceita quando a API autorizada não pode revalidar.']].map(([title,subtitle,body])=><section className="settings-card integration" key={title}><span className="integration-symbol"><Link2 size={24}/></span><h2>{title}</h2><span className="badge neutral">{subtitle}</span><p>{body}</p>{title==='Mercado Livre'&&<MercadoLivreConnection/>}{title==='Telegram'&&isAdmin&&<button className="secondary" onClick={()=>setView('Conexões Telegram')}>Conectar conta via MTProto</button>}</section>)}</div></>}
  {view==='Logs de atividade'&&<><OperatorActivity key={workspaceBrand} operation={workspaceBrand}/><section className="catalog" style={{marginBottom:20}}><div className="catalog-heading"><h2>Publicações confirmadas manualmente no WhatsApp · {confirmedPublications.length}</h2></div>{!!reviewPublications.length&&<p className="section-note notice-warning">{reviewPublications.length} registro(s) antigo(s) aguardam revisão e não são contabilizados como confirmação manual.</p>}{!confirmedPublications.length?<div className="empty"><p>Nenhuma publicação manual confirmada.</p></div>:<div className="logs-list">{confirmedPublications.map(p=><div key={p.id}><div><b>{p.snapshot.name}</b><p>{new Date(p.published_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</p><details><summary>Ver legenda publicada</summary><CaptionContent text={p.caption}/></details></div></div>)}</div>}</section><section className="catalog"><div className="catalog-heading"><div><h2>Histórico da operação</h2><p>Cadastros, mudanças de estado e execução das integrações.</p></div></div>{!logs.length?<div className="empty"><Clipboard size={28}/><p>As próximas ações aparecerão aqui.</p></div>:<div className="logs-list">{logs.map((l,i)=><div key={i}><span className="log-icon"><Check size={16}/></span><div><b>{l.event}</b><p>{l.detail}</p></div><time>{new Date(l.created_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</time></div>)}</div>}</section></>}
  {!isShopeeOperation(workspaceBrand)&&!(workspaceBrand==='all'&&view==='Visão geral')&&view==='Catálogo de produtos'&&<div className="table-footer"><span>{total} produtos no resultado · página {page+1} · até 24 por página</span><div className="copy-actions"><button className="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Página anterior</button><button className="secondary" disabled={!more} onClick={()=>setPage(p=>p+1)}>Próxima página</button></div></div>}
  {view==='Logs de atividade'&&<div className="table-footer"><span>Página {historyPage+1} do histórico · até 20 por lista</span><div className="copy-actions"><button className="secondary" disabled={!historyPage} onClick={()=>setHistoryPage(p=>p-1)}>Histórico anterior</button><button className="secondary" disabled={!historyMore} onClick={()=>setHistoryPage(p=>p+1)}>Mais histórico</button></div></div>}
  <footer className="page-footer"><span><Zap size={13}/> DROPOU AUTOMAÇÃO</span><span>Curadoria inteligente. Economia de verdade.</span></footer></>}</main></div>
  <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={e=>upload(e.target.files?.[0])}/>
  {details&&<ProductDetails archived={view==='Catálogo de produtos'&&archivedCatalog} onLifecycle={async message=>{setDetails(null);await refresh();setToast(message);}} product={details} offer={offers.find(o=>o.product_id===details.id)} publications={publications} onClose={()=>setDetails(null)} onEdit={()=>{setEditing(details);setDetails(null);}} onPreview={()=>{setPreview(details);setDetails(null);}}/>}
  {choosingOperation&&<WorkSurface labelledBy="general-create-title" className="general-create-dialog"><div className="section-title"><h2 id="general-create-title">Criar oferta</h2><button className="general-icon-button" aria-label="Fechar" title="Fechar seletor" onClick={()=>setChoosingOperation(false)}><X size={18}/></button></div><p>Em qual operação você quer cadastrar o produto?</p><div className="general-create-options">{workspaceBrands.filter(b=>b.id!=='all'&&allowedBrands?.includes(b.id)).map(b=><button key={b.id} onClick={()=>{setChoosingOperation(false);openOffer('nova',b.id);}}>{brandNames[b.id]||b.name}<ArrowUpRight size={16}/></button>)}</div></WorkSurface>}
  <QuickOfferOutlet/>{toast&&<div className="toast" role="status"><span>{toast}</span><button aria-label="Dispensar" onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div></QuickOfferProvider></WorkspaceState>;
}
function Status({value}:{value:Product['status']}){return <span className={`badge status-${value.replaceAll(' ','-')}`}><span/>{value==='aguardando link'?'Aguardando link':value[0].toUpperCase()+value.slice(1)}</span>;}
