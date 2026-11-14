'use client';
import {useEffect,useRef,useState} from 'react';
import {acceptOfferUpdate} from '@/lib/offer-view-state';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
import {api} from '@/lib/api';
import {Product} from '@/lib/domain';
import {Offer} from '@/lib/offers';
import type {PublicationContext} from '@/lib/publication';
import {selectedOperation,selectOperation,operationSchema,operationCategories} from '@/lib/workspace-brands';
import {emptyProduct} from '@/lib/product-draft';
const ProductForm=dynamic(()=>import('./product-form'),{loading:()=> <p role="status">Carregando cadastro…</p>});
const OfferPreview=dynamic(()=>import('./offer-preview'),{loading:()=> <p role="status">Carregando publicação…</p>});
export default function OfferWorkspace({id,edit=false}:{id?:string;edit?:boolean}){
 const [data,setData]=useState<{product:Product;offer?:Offer}&PublicationContext>(),[error,setError]=useState(''),router=useRouter();
 const [fromSaved,setFromSaved]=useState(false);useEffect(()=>setFromSaved(new URLSearchParams(window.location.search).get('return')==='shopee-saved'),[]);
 const returnQuery=fromSaved?'&return=shopee-saved':'',back=fromSaved?'/?brand='+(data?.product.operation||selectedOperation())+'&view=shopee-saved':'/';
 const sequence=useRef(0);
 async function refresh(){const active=++sequence.current;if(id){const d=await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer?brand='+selectedOperation());if(sequence.current===active)(selectOperation(d.product.operation||'dropou'),setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d));}}
 useEffect(()=>{let alive=true;const active=++sequence.current;setError('');if(id)api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer?brand='+selectedOperation()).then(d=>{if(alive&&sequence.current===active){selectOperation(d.product.operation||'dropou');setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d);}}).catch(e=>{if(alive)setError((e as Error).message);});else {const operation=operationSchema.catch('dropou').parse(selectedOperation());selectOperation(operation);const link=new URLSearchParams(window.location.search).get('link')||'';setData({product:{...emptyProduct(),operation,niche:operationCategories[operation][0],affiliateUrl:/^https:\/\/(?:[a-z0-9-]+\.)?shopee\.com\.br\//i.test(link)?'':link,...(/^https:\/\/(?:[a-z0-9-]+\.)?shopee\.com\.br\//i.test(link)?{store:'Shopee' as const,originalUrl:link}:{})}})};return()=>{alive=false;};},[id,edit]);
 async function save(p:Product,caption?:string,originalCaption?:string){
  const {product}=await api<{product:Product}>('/api/products','POST',p);
  const result=await api<{offer:Offer}>('/api/offers','POST',{productId:product.id,caption,originalCaption,manualEdit:caption!==originalCaption,expected:product});
  setData(await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+product.id+'/offer'));router.replace('/ofertas/'+product.id+'?brand='+(product.operation||'dropou')+returnQuery);
 }
 return <main className="offer-page" data-operation={data?.product.operation||'dropou'}><header className="offer-page-header"><a className="brand" href="/">dropou<span className="brand-dot">.</span></a><a className="secondary" href={fromSaved?back:'/?brand='+(data?.product.operation||selectedOperation())}>{fromSaved?'Voltar aos produtos salvos':'Voltar ao painel'}</a></header>{error?<div className="section-note" role="alert">{error} <a href="/">Abrir painel / entrar na conta</a></div>:!data||id&&data.product.id!==id?<div className="workspace-skeleton" role="status">Carregando oferta…</div>:edit||!id?<ProductForm lockedOperation={!!id} key={data.product.id} product={data.product} initialCaption={data.offer?.caption} initialOriginalCaption={data.offer?.original_caption} page onClose={()=>router.push(back)} onSave={save}/>:<OfferPreview initialAction={typeof window!=='undefined'&&['schedule','telegram'].includes(new URLSearchParams(window.location.search).get('action')||'')?new URLSearchParams(window.location.search).get('action') as 'schedule'|'telegram':undefined} context={data} key={data.product.id} onStored={(offer,serverNow)=>setData(current=>current&&current.product.id===offer.product_id?{...current,...acceptOfferUpdate(current,{product:offer.snapshot,offer}),serverNow:serverNow||current.serverNow}:current)} product={data.product} offer={data.offer} page onRefresh={refresh} onClose={()=>router.push(back)} onEdit={()=>router.push('/ofertas/'+data.product.id+'/editar?brand='+(data.product.operation||'dropou')+returnQuery)}/>}</main>;
}
