'use client';
import {useEffect,useRef,useState} from 'react';
import {Link2,RefreshCw,Check,ArrowUpRight} from 'lucide-react';
import {apiForOperation,type api} from '@/lib/api';
import {dropouExtensionOrigin,extensionProtocol,type ExtensionInbox} from '@/lib/mercado-livre-extension';
import {createExtensionPageBridge} from '@/lib/mercado-livre-extension-bridge';
import {isLocalOperation,operationName,type OperationScope} from '@/lib/workspace-brands';
import {money,type Product} from '@/lib/domain';
import {useQuickOffer} from './quick-offer-context';
import ProductMedia from './product-media';
export function ExtensionProductReview({row,request,onPrepared}:{row:ExtensionInbox;request:typeof api;onPrepared:(product:Product,existing:boolean)=>void}){
 const p=row.draft,[name,setName]=useState(''),[price,setPrice]=useState(''),[image,setImage]=useState(''),[variant,setVariant]=useState(''),[confirmed,setConfirmed]=useState(false),[inStock,setInStock]=useState(p.inStock===true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const needsVariant=p.visualDetails?.uncertainFields.includes('selectedVariant');
 return <form className="ml-extension-review" onSubmit={async e=>{e.preventDefault();if(!confirmed||lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await request<{product:Product;existing:boolean}>('/api/mercado-livre/extension','POST',{action:'prepare',review:{id:row.id,confirmed:true,inStock,...(!p.name?{name}:{}),...(!p.price?{price:Number(price)}:{}),...(!p.image&&!p.imagePath?{image}:{}),...(needsVariant?{variant}:{})}});if(alive.current)onPrepared(result.product,result.existing);}catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}}>
  <div className="ml-extension-product"><ProductMedia product={p}/><div><span>Mercado Livre · Aguardando conferência</span><h3>{p.name||'Produto aguardando nome'}</h3><strong>{p.price?money(p.price):'Preço não disponível'}</strong></div></div>
  <p>{row.message}</p>{row.destination_match!==true&&<p>Destino do link curto não confirmado automaticamente. Abra os dois links e confira o mesmo anúncio, vendedor e variante.</p>}
  <div className="ml-extension-links"><a href={row.original_url} target="_blank" rel="noopener noreferrer">Abrir anúncio original <ArrowUpRight size={14}/></a><a href={row.candidate_url} target="_blank" rel="noopener noreferrer sponsored">Abrir link candidato <ArrowUpRight size={14}/></a><small>{row.original_url}</small><small>{row.candidate_url}</small></div>
  {row.existing&&<p>Já cadastrado: as edições e o histórico serão preservados. {p.affiliateUrl?'O link já salvo será mantido; o novo candidato fica nesta solicitação para consulta.':'Ao confirmar, o candidato preencherá somente o link de afiliado ausente.'}</p>}
  <div className="ml-extension-fields">{!p.name&&<label>Nome no anúncio<input required maxLength={180} value={name} onChange={e=>{setName(e.target.value);setConfirmed(false);}}/></label>}{!p.price&&<label>Preço atual (R$)<input required type="number" min="0.01" max="1000000" step="0.01" value={price} onChange={e=>{setPrice(e.target.value);setConfirmed(false);}}/></label>}{!p.image&&!p.imagePath&&<label>URL HTTPS da foto real<input required type="url" value={image} onChange={e=>{setImage(e.target.value);setConfirmed(false);}}/></label>}{needsVariant&&<label>Variante conferida<input required maxLength={100} value={variant} onChange={e=>{setVariant(e.target.value);setConfirmed(false);}}/></label>}</div>
  <label className="check-label"><input type="checkbox" checked={inStock} onChange={e=>{setInStock(e.target.checked);setConfirmed(false);}}/>Produto disponível no anúncio agora.</label>
  <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Conferi anúncio, vendedor, variante, preço, foto e link gerado na minha conta de afiliado.</label>
  <p className="fine-print">Link candidato e destino correspondente não comprovam atribuição nem comissão. Receber este produto não agenda ou publica.</p>
  {error&&<p role="alert">{error}</p>}<button className="primary" disabled={!confirmed||busy}><Check size={16}/>{busy?'Preparando…':row.existing?'Abrir oferta existente':'Conferir e abrir oferta'}</button>
 </form>;
}
export default function MercadoLivreExtension({operation,account,request=apiForOperation(operation)}:{operation:OperationScope;account:string;request?:typeof api}){
 const quick=useQuickOffer(),[rows,setRows]=useState<ExtensionInbox[]>([]),[selected,setSelected]=useState<string>(),[open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),active=useRef(true);
 const supported=operation!=='all'&&!isLocalOperation(operation);
 function accept(incoming:ExtensionInbox[]){setRows(old=>[...incoming,...old.filter(r=>!incoming.some(n=>n.id===r.id))].slice(0,20));setSelected(incoming.find(r=>r.state==='pending')?.id);setOpen(true);setError('');}
 useEffect(()=>{active.current=true;const bridge=createExtensionPageBridge(operation,request,accept);
  const listener=async(event:MessageEvent)=>{
   if(window.location.origin!==dropouExtensionOrigin||event.source!==window||event.origin!==dropouExtensionOrigin||event.data?.protocol!==extensionProtocol||event.data?.direction!=='to-page')return;
   const id=event.data.id;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return;
   let result;try{result=await bridge.handle(event.data);}catch(e){result={ok:false,error:(e as Error).message.slice(0,240)};}
   if(active.current)window.postMessage({protocol:extensionProtocol,direction:'to-extension',id,result},dropouExtensionOrigin);
  };window.addEventListener('message',listener);return()=>{active.current=false;bridge.dispose();window.removeEventListener('message',listener);};
 },[operation,account,request,supported]);
 if(!supported)return null;
 const row=rows.find(r=>r.id===selected);
 return <details className="ml-extension-inbox" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary><Link2 size={16}/>Extensão Mercado Livre · {operationName(operation)}{rows.some(r=>r.state==='pending')&&<span> · Conferência pendente</span>}</summary><p>Conecte o painel da extensão com esta operação. O envio é individual e depende do seu clique.</p><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const data=await request<{rows:ExtensionInbox[]}>('/api/mercado-livre/extension');if(active.current){setRows(data.rows);setSelected(data.rows[0]?.id);}}catch(e){if(active.current)setError((e as Error).message);}finally{if(active.current)setBusy(false);}}}><RefreshCw size={14}/>{busy?'Carregando…':'Produtos recebidos'}</button>{error&&<p role="alert">{error}</p>}
  {!!rows.length&&<div className="ml-extension-items">{rows.map(r=><button className="secondary" key={r.id} aria-pressed={selected===r.id} onClick={()=>setSelected(r.id)}>{r.draft.name||'Completar produto'} · {r.state==='prepared'||r.existing?'Já cadastrado':'Aguardando conferência'}</button>)}</div>}
  {row&&!quick?.target&&<ExtensionProductReview key={row.id} row={row} request={request} onPrepared={(product,existing)=>{setRows(old=>old.map(r=>r.id===row.id?{...r,state:'prepared',existing,product_id:product.id}:r));quick?.open({id:product.id,operation,product});}}/>}{quick?.target&&row&&<p>Feche a oferta aberta para conferir outro recebimento.</p>}
 </details>;
}
