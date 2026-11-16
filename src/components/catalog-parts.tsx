'use client';
import {CalendarDays,Clock3,ExternalLink,Gamepad2,Headphones,House,Info,Lamp,Package,Pin,PinOff,RotateCw,Search,Smartphone,Sparkles,SprayCan,TreePine,Wrench,Shirt,Footprints,Car} from 'lucide-react';
import type {CatalogDestination,CatalogRow} from '@/lib/catalog';
import {catalogRetention} from '@/lib/catalog';
import {money} from '@/lib/domain';
import {operationName,type OperationScope} from '@/lib/workspace-brands';
import {publicationDate} from '@/lib/publication-history';
import ProductMedia from './product-media';
import {ChannelMark,MarketplaceBadge} from './general-brand-marks';

export function CatalogBanner({operation,rows}:{operation:OperationScope;rows:CatalogRow[]}){
 const icons={all:[Package,House,Sparkles],dropou:[Gamepad2,Headphones,Package],celulares:[Smartphone,Headphones,Package],bruto:[Wrench,Package,Wrench],moda:[Shirt,Footprints,Shirt],tenis:[Footprints,Footprints,Package],automoto:[Car,Wrench,Car],beleza:[SprayCan,Sparkles,SprayCan],casa:[Lamp,House,Lamp],natal:[TreePine,Sparkles,TreePine]}[operation];
 const photos=rows.filter(r=>(operation==='all'||r.brand_id===operation)&&(r.data.image||r.data.imagePath)).slice(0,3);
 return <header className="catalog-banner"><div className="catalog-banner-copy"><span>{operation==='all'?'CENTRAL DE OPERAÇÕES':operationName(operation)}</span><h1>Catálogo de produtos</h1><p>Gerencie, publique e reposte suas melhores ofertas em poucos cliques.</p></div><div className="catalog-banner-art" aria-hidden="true">{operation==='dropou'?<img src="/images/shopee-gaming-hero.webp" width="912" height="512" alt="" fetchPriority="high"/>:<div className="catalog-banner-composition">{icons.map((Icon,i)=><span key={i}>{photos[i]?<ProductMedia product={photos[i].data} large/>:<Icon strokeWidth={1}/>}</span>)}</div>}<div className="catalog-banner-plinth"/></div></header>;
}
export function CatalogExpiration({row,now}:{row:CatalogRow;now:number}){const state=catalogRetention(row,now);return <span className={'catalog-expiration expiration-'+state.state} title={'Entrada: '+publicationDate(row.entered_at)+' · prazo original: '+publicationDate(row.expires_at)}>{row.pinned?<Pin size={12}/>:state.state==='expired'?<Info size={12}/>:<Clock3 size={12}/>}<span>{state.label}</span></span>;}
export function CatalogPin({row,busy,onPin}:{row:CatalogRow;busy:boolean;onPin:()=>void}){return <button className="catalog-pin" title={row.pinned?'Desafixar produto':'Fixar produto'} aria-label={(row.pinned?'Desafixar produto: ':'Fixar produto: ')+row.data.name} aria-pressed={row.pinned} disabled={busy} onClick={onPin}>{row.pinned?<PinOff size={14}/>:<Pin size={14}/>}</button>;}
export function CatalogDestinationBadges({destinations,published,onHistory}:{destinations:CatalogDestination[];published:boolean;onHistory:(destination:CatalogDestination)=>void}){
 const shown=destinations.filter(d=>!!d.publishedAt===published);
 return <div className="catalog-destination-badges">{shown.slice(0,2).map(d=><button key={d.channel+':'+d.name} onClick={()=>onHistory(d)} title={d.name+' · '+(d.publishedAt?publicationDate(d.publishedAt):d.scheduledAt?'Agendado: '+publicationDate(d.scheduledAt):'Ainda não publicado')}><ChannelMark channel={d.channel}/><span>{d.name||d.channel}</span>{!published&&d.state!=='not_published'&&<small>{d.state==='queued'||d.state==='ready'?'Agendado':d.state==='uncertain'||d.state==='partial'?'Revisar':'Pendente'}</small>}</button>)}{!shown.length&&<small>{published?'Sem confirmação neste destino':destinations.length?'Todos os destinos confirmados':'Nenhum destino configurado'}</small>}</div>;
}
export function CatalogProductRow({row,now,busy,onOpen,onRepost,onPin,onHistory,onRemove}:{row:CatalogRow;now:number;busy:boolean;onOpen:()=>void;onRepost:()=>void;onPin:()=>void;onHistory:()=>void;onRemove:()=>void}){
 return <article className="catalog-product-row" data-product-id={row.id}>
  <div className="catalog-product-identity"><button className="catalog-product-photo" onClick={onOpen} aria-label={'Abrir oferta: '+row.data.name}><ProductMedia product={row.data}/></button><div><div className="catalog-name-line"><h3 title={row.data.name}>{row.data.shortName||row.data.name}</h3>{row.pinned&&<span className="catalog-pinned-label"><Pin size={10}/>Fixado</span>}</div><p>{row.data.niche}{row.kind==='saved'?' · Importação pendente':''}</p><CatalogExpiration row={row} now={now}/></div></div>
  <div className="catalog-price"><span className="catalog-mobile-label">Preço</span><strong>{row.data.price>0?money(row.data.price):'Indisponível'}</strong></div>
  <div className="catalog-category"><span>{row.data.niche||'Sem categoria'}</span></div>
  <div className="catalog-marketplace"><MarketplaceBadge store={row.data.store||'Shopee'}/></div>
  <div className="catalog-published"><span className="catalog-mobile-label">Publicado em</span><CatalogDestinationBadges destinations={row.destinations} published onHistory={onHistory}/>{row.published_at&&!row.destinations.some(d=>d.publishedAt)&&<button className="catalog-history-link" onClick={onHistory}>Ver publicação anterior</button>}</div>
  <div className="catalog-publication-date"><span className="catalog-mobile-label">Última publicação</span>{row.published_at?<button onClick={onHistory}><CalendarDays size={12}/>{publicationDate(row.published_at)}</button>:<small>Ainda não publicado</small>}</div>
  <div className="catalog-missing"><span className="catalog-mobile-label">Ainda não publicado em</span><CatalogDestinationBadges destinations={row.destinations} published={false} onHistory={onHistory}/></div>
  <div className="catalog-row-actions"><button className="catalog-repost" disabled={busy||!!row.archived_at||row.curation_state==='rejected'||row.kind==='saved'} onClick={onRepost}><RotateCw size={13}/><span>Republicar</span></button><button className="catalog-open" aria-label={'Abrir oferta: '+row.data.name} title="Abrir oferta" disabled={busy} onClick={onOpen}><ExternalLink size={14}/></button><details className="catalog-row-menu"><summary aria-label={'Mais opções: '+row.data.name}>•••</summary><div><CatalogPin row={row} busy={busy} onPin={onPin}/><span>{row.pinned?'Desafixar':'Fixar produto'}</span>{row.kind==='product'&&<button disabled={busy} onClick={onHistory}>Histórico por destino</button>}<button disabled={busy} onClick={onRemove}>Excluir produto…</button></div></details></div>
 </article>;
}
export const CatalogSearchIcon=Search;
