'use client';
import {useEffect,useState} from 'react';
import type {api} from '@/lib/api';
import type {CatalogDestination} from '@/lib/catalog';
import {publicationDate} from '@/lib/publication-history';
import {CatalogDestinationBadges} from './catalog-parts';
import type {OperationId} from '@/lib/workspace-brands';
export default function CatalogRepostContext({id,operation,request,onSelectChannel}:{id:string;operation:OperationId;request:typeof api;onSelectChannel:(channel:'telegram'|'whatsapp')=>void}){
 const [destinations,setDestinations]=useState<CatalogDestination[]>(),[error,setError]=useState('');
 useEffect(()=>{let active=true;void request<{destinations:CatalogDestination[]}>('/api/catalog/'+id+'/history?brand='+operation).then(r=>{if(active)setDestinations(r.destinations);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,operation,request]);
 return <section className="catalog-repost-context"><h3>Republicar esta oferta</h3><p>Confira preço, disponibilidade e link na loja. Os dados salvos não são uma nova consulta ao marketplace; use “Conferi os dados exibidos” ou salve a oferta para confirmar sua revisão.</p><div><b>Destinos já confirmados</b>{destinations?.filter(d=>d.publishedAt).map(d=><span key={d.channel}>{d.name} · {publicationDate(d.publishedAt)}</span>)}{destinations&&!destinations.some(d=>d.publishedAt)&&<span>Nenhuma confirmação no destino atual.</span>}</div><div><b>Ainda falta publicar</b>{destinations&&<CatalogDestinationBadges destinations={destinations} published={false} onHistory={d=>onSelectChannel(d.channel)}/>}</div><p>Em Mais opções, autorize uma nova publicação nos destinos já utilizados ou selecione canais adicionais. Nenhum envio é feito ao abrir.</p>{error&&<p role="alert">{error}</p>}</section>;
}
