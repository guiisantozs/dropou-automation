'use client';
import {useState} from 'react';
import {CheckCheck,Clipboard,Link2,Loader2,Trash2,X} from 'lucide-react';
import {caption,freshPrice,Product,publicationError} from '@/lib/domain';
import {Offer} from '@/lib/offers';
import {api} from '@/lib/api';
import {copyText} from '@/lib/clipboard';
export default function OfferPreview({product,offer,onRefresh,onClose,onEdit}:{product:Product;offer?:Offer;onRefresh:()=>Promise<void>;onClose:()=>void;onEdit:()=>void}){
 const [saved,setSaved]=useState(offer),[text,setText]=useState(caption(product)),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[posted,setPosted]=useState(false);
 const blocked=publicationError({...product,status:'pronto'});
 async function action(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function copy(value:string){await action(async()=>{const valueNow=caption(product);if(value===text&&valueNow!==text){setText(valueNow);setCopied(false);throw new Error('A conferência expirou. A legenda foi atualizada para rascunho; gere e confira novamente.');}await copyText(value);if(value===text)setCopied(true);setMessage('Copiado para a área de transferência.');});}
 return <div className="modal-backdrop"><section className="modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="offer-preview-title"><div className="modal-heading"><div><span className="eyebrow">OFERTA PARA WHATSAPP</span><h2 id="offer-preview-title">Gerar legenda</h2></div><button aria-label="Fechar" onClick={onClose}><X/></button></div>
 {blocked&&<div className="section-note">{blocked} Você pode salvar o rascunho; a publicação permanece bloqueada.</div>}
 <pre className="caption">{text}</pre><div className="copy-actions"><button className="secondary" disabled={busy} onClick={()=>{setText(caption(product));setCopied(false);setMessage('Legenda gerada com os dados registrados. Salve a oferta para persistir.');}}>Gerar legenda</button><button className="primary" disabled={busy} onClick={()=>copy(text)}><Clipboard size={16}/>Copiar legenda completa</button><button className="secondary" disabled={busy||!product.affiliateUrl} onClick={()=>copy(product.affiliateUrl)}><Link2 size={16}/>Copiar link de afiliado</button></div>
 <p className="muted fine-print">{saved?`Oferta salva · ${saved.status}`:'Legenda ainda não salva.'}{copied?' · Legenda copiada nesta sessão.':''}</p>
 <label className="check-label" style={{marginTop:20}}><input type="checkbox" checked={posted} onChange={e=>setPosted(e.target.checked)}/>Publiquei manualmente esta legenda no meu canal do WhatsApp</label>
 <div className="copy-actions"><button className="primary" disabled={busy||product.status==='publicado'} onClick={()=>action(async()=>{const result=await api<{offer:Offer}>('/api/offers','POST',{productId:product.id});setSaved(result.offer);setText(result.offer.caption);await onRefresh();setMessage('Oferta salva no Supabase.');})}>{busy?<Loader2 size={16}/>:null}Salvar oferta</button><button className="secondary" disabled={busy||!saved||saved.status==='publicado'||!!blocked||!posted} onClick={()=>action(async()=>{if(!saved)return;await api(`/api/offers/${saved.id}/publish`,'POST');await onRefresh();setSaved({...saved,status:'publicado'});setMessage('Publicação manual registrada. As métricas foram atualizadas com os dados do banco.');})}><CheckCheck size={16}/>Marcar como publicada</button></div>
 <div className="modal-footer"><button className="secondary" onClick={onEdit}>Editar / revalidar produto</button><button className="secondary" disabled={busy||!saved} onClick={()=>setConfirmDelete(true)}><Trash2 size={15}/>Excluir oferta</button></div>
 {confirmDelete&&<div className="section-note" style={{marginTop:16}}>Excluir esta oferta da fila? O produto, os preços registrados e o histórico de publicações serão preservados.<button className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancelar</button><button className="secondary" disabled={busy} onClick={()=>action(async()=>{if(!saved)return;await api(`/api/offers/${saved.id}`,'DELETE');await onRefresh();onClose();})}>Confirmar exclusão</button></div>}
 <p className="form-error" role="status">{message}</p></section></div>;
}
