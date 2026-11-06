'use client';
import {useEffect,useRef,useState} from 'react';
import {acceptOfferUpdate} from '@/lib/offer-view-state';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
import {api} from '@/lib/api';
import {Product} from '@/lib/domain';
import {Offer} from '@/lib/offers';
import type {PublicationContext} from '@/lib/publication';
import {emptyProduct} from '@/lib/product-draft';
const ProductForm=dynamic(()=>import('./product-form'),{loading:()=> <p role="status">Carregando cadastro…</p>});
const OfferPreview=dynamic(()=>import('./offer-preview'),{loading:()=> <p role="status">Carregando publicação…</p>});
export default function OfferWorkspace({id,edit=false}:{id?:string;edit?:boolean}){
 const [data,setData]=useState<{product:Product;offer?:Offer}&PublicationContext>(),[error,setError]=useState(''),router=useRouter();
 const sequence=useRef(0);
 async function refresh(){const active=++sequence.current;if(id){const d=await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer');if(sequence.current===active)setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d);}}
 useEffect(()=>{let alive=true;const active=++sequence.current;setError('');if(id)api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+id+'/offer').then(d=>{if(alive&&sequence.current===active)setData(current=>current?{...d,...acceptOfferUpdate(current,d)}:d);}).catch(e=>{if(alive)setError((e as Error).message);});else setData({product:emptyProduct()});return()=>{alive=false;};},[id,edit]);
 async function save(p:Product,caption?:string,originalCaption?:string){
  const {product}=await api<{product:Product}>('/api/products','POST',p);
  const result=await api<{offer:Offer}>('/api/offers','POST',{productId:product.id,caption,originalCaption,manualEdit:caption!==originalCaption,expected:product});
  setData(await api<{product:Product;offer?:Offer}&PublicationContext>('/api/products/'+product.id+'/offer'));router.replace('/ofertas/'+product.id);
 }
 return <main className="offer-page"><header className="offer-page-header"><a className="brand" href="/">dropou<span className="brand-dot">.</span></a><a className="secondary" href="/">Voltar ao painel</a></header>{error?<div className="section-note" role="alert">{error} <a href="/">Abrir painel / entrar na conta</a></div>:!data||id&&data.product.id!==id?<div className="workspace-skeleton" role="status">Carregando oferta…</div>:edit||!id?<ProductForm key={data.product.id} product={data.product} initialCaption={data.offer?.caption} initialOriginalCaption={data.offer?.original_caption} page onClose={()=>router.push('/')} onSave={save}/>:<OfferPreview context={data} key={data.product.id} onStored={(offer,serverNow)=>setData(current=>current&&current.product.id===offer.product_id?{...current,...acceptOfferUpdate(current,{product:offer.snapshot,offer}),serverNow:serverNow||current.serverNow}:current)} product={data.product} offer={data.offer} page onRefresh={refresh} onClose={()=>router.push('/')} onEdit={()=>router.push('/ofertas/'+data.product.id+'/editar')}/>}</main>;
}
