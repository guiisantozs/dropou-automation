'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Clock3,Pencil,Send,X} from 'lucide-react';
import {freshPrice,money,Product} from '@/lib/domain';
import {Offer,Publication} from '@/lib/offers';
import {api} from '@/lib/api';
import Dialog from './dialog';
import ProductMedia from './product-media';
import {ProductStatus} from './product-catalog';
import CaptionContent from './caption-content';
type Record={id:string;price:number;checked_at:string|null;recorded_at:string};
export default function ProductDetails({product,offer,publications,onClose,onEdit,onPreview}:{product:Product;offer?:Offer;publications:Publication[];onClose:()=>void;onEdit:()=>void;onPreview:()=>void}){
 const [history,setHistory]=useState<Record[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{api<{records:Record[]}>('/api/products/'+product.id+'/history').then(d=>setHistory(d.records)).catch(e=>setMessage((e as Error).message));},[product.id]);
 return <Dialog labelledBy="product-details-title" className="details-modal"><div className="modal-heading"><div><span className="eyebrow">DETALHES DO PRODUTO</span><h2 id="product-details-title">Seu produto, em um só lugar</h2></div><button aria-label="Fechar" onClick={onClose}><X/></button></div><div className="details-hero"><ProductMedia product={product} large/><div><ProductStatus product={product}/><h3>{product.name}</h3><p>{product.visualDetails?.brand} {product.visualDetails?.model} {product.visualDetails?.selectedVariant}</p><strong className="details-price">{money(product.price)}</strong><small>{freshPrice(product)?'Conferência válida por até 15 minutos':'Preço histórico · confira novamente na loja'}</small></div></div><a className="affiliate-link" href={product.affiliateUrl||product.originalUrl} target="_blank" rel="noreferrer">Abrir anúncio com o link original <ArrowUpRight size={16}/></a><div className="copy-actions"><button className="secondary" onClick={onEdit}><Pencil size={16}/>Editar / conferir preço</button><button className="primary" onClick={onPreview}><Send size={16}/>Publicar / preparar WhatsApp</button></div><h3>Legenda salva</h3>{offer?<CaptionContent text={offer.caption}/>:<p className="fine-print">Prepare a oferta para criar sua primeira legenda.</p>}<details className="detail-history"><summary><Clock3 size={16}/>Histórico de preços e publicações</summary>{history.length?history.map(r=><p key={r.id}><b>{money(Number(r.price))}</b> · {new Date(r.recorded_at).toLocaleString('pt-BR')}{r.checked_at?' · Conferência registrada':' · Sem conferência atual'}</p>):<p>Nenhum registro de preço disponível.</p>}{publications.filter(p=>p.product_id===product.id).map(p=><p key={p.id}>WhatsApp · {new Date(p.published_at).toLocaleString('pt-BR')}</p>)}{product.status==='publicado'&&!publications.some(p=>p.product_id===product.id)&&<p>Publicação registrada no produto. Consulte os logs para o canal e a entrega.</p>}{message&&<p role="status">{message}</p>}</details></Dialog>;
}
