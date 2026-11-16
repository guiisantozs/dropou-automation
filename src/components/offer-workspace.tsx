'use client';
import {usePublicationRefresh} from '@/lib/publication-sync';
import {useEffect,useRef,useState} from 'react';
import {acceptOfferUpdate} from '@/lib/offer-view-state';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {offerLocation,workspaceReturn} from '@/lib/workspace-navigation';
import WorkspaceLoading from './workspace-loading';
import {apiForOperation} from '@/lib/api';
import {Product} from '@/lib/domain';
import {Offer} from '@/lib/offers';
import type {PublicationContext} from '@/lib/publication';
import {selectedOperation,selectOperation,operationSchema,operationCategories} from '@/lib/workspace-brands';
import {emptyProduct} from '@/lib/product-draft';
const ProductForm=dynamic(()=>import('./product-form'),{loading:()=> <p role="status">Carregando cadastro…</p>});
const OfferPreview=dynamic(()=>import('./offer-preview'),{loading:()=> <p role="status">Carregando publicação…</p>});
export default function OfferWorkspace({id,edit=false}:{id?:string;edit?:boolean}){
 const [data,setData]=useState<{product:Product;offer?:Offer}&PublicationContext>(),[error,setError]=useState(''),router=useRouter();
 const [operation,setOperation]=useState<ReturnType<typeof selectedOperation>>('dropou');const api=apiForOperation(data?.product.operation||operation);
 useEffect(()=>setOperation(selectedOperation()),[id,edit]);
 const [origin,setOrigin]=useState<string>(),[editFromOffer,setEditFromOffer]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(window.location.search);setOrigin(workspaceReturn(params.get('returnTo'))||(params.get('return')==='shopee-saved'?'/?brand='+selectedOperation()+'&view=shopee-saved':undefined));setEditFromOffer(params.get('back')==='offer');},[id,edit]);
 const brand=data?.product.operation||operation,back=origin||'/?brand='+brand,close=edit&&id&&editFromOffer?offerLocation(id,brand,'preview',origin):back;
 const sequence=useRef(0);
 async function refresh(){const active=++sequence.current;if(id){const d=await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer?brand='+selectedOperation());if(sequence.current===active)(selectOperation(d.product.operation||'dropou'),setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d));}}
 useEffect(()=>{let alive=true;const active=++sequence.current;setError('');if(id)api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer?brand='+selectedOperation()).then(d=>{if(alive&&sequence.current===active){selectOperation(d.product.operation||'dropou');setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d);}}).catch(e=>{if(alive)setError((e as Error).message);});else {const operation=operationSchema.catch('dropou').parse(selectedOperation());selectOperation(operation);const link=new URLSearchParams(window.location.search).get('link')||'';setData({product:{...emptyProduct(),operation,niche:operationCategories[operation][0],affiliateUrl:/^https:\/\/(?:[a-z0-9-]+\.)?shopee\.com\.br\//i.test(link)?'':link,...(/^https:\/\/(?:[a-z0-9-]+\.)?shopee\.com\.br\//i.test(link)?{store:'Shopee' as const,originalUrl:link}:{})}})};return()=>{alive=false;};},[id,edit]);
 async function save(p:Product,caption?:string,originalCaption?:string){
  const {product,existing}=await api<{product:Product;existing?:boolean}>('/api/products','POST',p);
  if(existing){router.replace(offerLocation(product.id,product.operation||'dropou','preview',origin));return;}
  const result=await api<{offer:Offer}>('/api/offers','POST',{productId:product.id,caption,originalCaption,manualEdit:caption!==originalCaption,expected:product});
  setData(await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+product.id+'/offer'));router.replace(offerLocation(product.id,product.operation||'dropou','preview',origin));
 }
 usePublicationRefresh(async()=>{if(id&&!edit)await refresh();});
 return <main className="offer-page operational-offer-page" data-operation={data?.product.operation||operation}><header className="offer-page-header"><Link className="brand" href={back}>dropou<span className="brand-dot">.</span></Link><Link className="secondary" href={close}>{edit&&editFromOffer?'Voltar à oferta':'Voltar à lista'}</Link></header>{error?<div className="section-note" role="alert">{error} <Link href={back}>Abrir painel / entrar na conta</Link></div>:!data||id&&data.product.id!==id?<WorkspaceLoading label="Carregando oferta…"/>:edit||!id?<ProductForm request={api} lockedOperation key={data.product.id} product={data.product} initialCaption={data.offer?.caption} initialOriginalCaption={data.offer?.original_caption} page onClose={()=>router.push(close)} onSave={save}/>:<OfferPreview request={api} initialAction={typeof window!=='undefined'&&['schedule','telegram'].includes(new URLSearchParams(window.location.search).get('action')||'')?new URLSearchParams(window.location.search).get('action') as 'schedule'|'telegram':undefined} context={data} key={data.product.id} onStored={(offer,serverNow)=>setData(current=>current&&current.product.id===offer.product_id?{...current,...acceptOfferUpdate(current,{product:offer.snapshot,offer}),serverNow:serverNow||current.serverNow}:current)} product={data.product} offer={data.offer} page onRefresh={refresh} onClose={()=>router.push(close)} onEdit={()=>router.push(offerLocation(data.product.id,data.product.operation||'dropou','edit',origin)+'&back=offer')}/>}</main>;
}
