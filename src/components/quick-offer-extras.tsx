'use client';
import {useRef,useState} from 'react';
import {Pencil,RotateCcw} from 'lucide-react';
import type {api} from '@/lib/api';
import type {QuickOfferData} from '@/lib/quick-publication';
import type {TelegramPresentation} from '@/lib/telegram-presentation';
import {formatCaption,type GenerationResult} from '@/lib/ai';
import {replaceDropouOpening} from '@/lib/dropou-captions';
import {isShopeeOperation} from '@/lib/workspace-brands';
import {offerLocation,currentWorkspace} from '@/lib/workspace-navigation';
import {channelState,type Channel} from '@/lib/channel-state';
import {TelegramMediaOptions,PublicationPhoto} from './telegram-preview';
import PublicationPhotoEditor from './publication-photo-editor';
import PublicationHistory from './publication-history';
import DeleteProduct from './delete-product';
import MultichannelPublication from './multichannel-publication';
import {isLocalOperation} from '@/lib/workspace-brands';

export default function QuickOfferExtras({data,text,request,busy,publicationDisabled=false,media,onMedia,onCaption,onEdit,onUpdate,onError,onClose,initiallyOpenHistory=false}:{data:QuickOfferData;text:string;request:typeof api;busy:boolean;publicationDisabled?:boolean;media:TelegramPresentation;onMedia:(value:TelegramPresentation)=>void;onCaption:(value:string)=>void;onEdit:()=>void;onUpdate:()=>Promise<void>;onError:(value:string)=>void;onClose:()=>void;initiallyOpenHistory?:boolean}){
 const [working,setWorking]=useState(false),[aiConsent,setAiConsent]=useState(false),[repost,setRepost]=useState<Channel>(),[confirmed,setConfirmed]=useState(false),[history,setHistory]=useState(initiallyOpenHistory),lock=useRef(false),repostRequest=useRef('');
 const product=data.product,brand=product.operation||'dropou';
 async function run(fn:()=>Promise<void>){if(lock.current||busy)return;lock.current=true;setWorking(true);onError('');try{await fn();}catch(e){onError((e as Error).message);}finally{lock.current=false;setWorking(false);}}
 return <div className="quick-offer-extra-body"><button className="secondary" disabled={busy||working} onClick={onEdit}><Pencil size={14}/>Editar dados do produto</button>
  <TelegramMediaOptions compact={isShopeeOperation(brand)} product={product} value={media} onChange={onMedia}/>
  {media.mediaMode==='photo'&&<details><summary>Conferir foto da publicação</summary><PublicationPhoto product={product}/></details>}
  {!data.archived&&<PublicationPhotoEditor request={request} product={product} onStored={onUpdate}/>}
  <details><summary>Outras legendas</summary><p>Gerar uma versão substitui o texto do editor. A alteração só será guardada ao salvar.</p>{isShopeeOperation(brand)?<button className="secondary" disabled={busy||working||data.archived} onClick={()=>void run(async()=>{const r=await request<{headline:string}>('/api/products/'+product.id+'/headline','POST',{current:text});if(brand==='dropou')onCaption(replaceDropouOpening(text,r.headline));else {const end=text.indexOf('\n\n');if(end<0)throw new Error('Separe a abertura da legenda por uma linha em branco.');onCaption(r.headline+' #publi'+text.slice(end));}})}><RotateCcw size={14}/>Gerar outra chamada gratuita</button>:<><button className="secondary" disabled={busy||working} onClick={()=>onCaption(formatCaption(product,brand))}>Usar template gratuito</button><label className="check-label"><input type="checkbox" checked={aiConsent} onChange={e=>setAiConsent(e.target.checked)}/>Autorizo substituir esta legenda por outra gerada com IA, conforme o orçamento configurado.</label><button disabled={!aiConsent||working||busy} className="secondary" onClick={()=>void run(async()=>{const r=await request<{results:GenerationResult[]}>('/api/ai/generate','POST',{productIds:[product.id],brand,variants:1});if(!r.results[0]?.captions[0])throw new Error('Nenhuma legenda foi retornada.');onCaption(r.results[0].captions[0]);setAiConsent(false);})}>Gerar legenda com IA</button></>}</details>
  {(['telegram','whatsapp'] as Channel[]).filter(c=>channelState(c,data,!!data.offer,product)==='sent'&&!data.republications?.some(i=>i.channel===c)).map(c=><button className="secondary" disabled={working||busy} key={c} onClick={()=>{repostRequest.current=crypto.randomUUID();setRepost(c);setConfirmed(false);}}>Republicar intencionalmente no {c==='telegram'?'Telegram':'WhatsApp'}</button>)}
  {repost&&<div className="quick-offer-notice"><p>Autorizar uma nova publicação no {repost==='telegram'?'Telegram':'WhatsApp'} preserva o histórico e não envia nada agora.</p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Quero autorizar uma nova publicação neste canal.</label><button className="secondary" disabled={!confirmed||busy||working} onClick={()=>void run(async()=>{await request('/api/offers/'+data.offer!.id+'/republication','POST',{channel:repost,requestKey:repostRequest.current,confirmed:true});await onUpdate();setRepost(undefined);})}>Autorizar nova publicação</button><button disabled={busy||working} onClick={()=>setRepost(undefined)}>Cancelar</button></div>}
  <details open={history} onToggle={e=>setHistory(e.currentTarget.open)}><summary>Histórico e registros</summary>{history&&<PublicationHistory productId={product.id} request={request} operation={brand} initiallyOpen/>}</details>
  {!isLocalOperation(brand)&&<MultichannelPublication product={product} offer={data.offer||undefined} text={text} presentation={media} disabled={busy||working||publicationDisabled||!!data.archived||text!==data.offer?.caption} request={request} onUpdate={onUpdate}/>}
  <div className="quick-offer-extra-links"><a href={offerLocation(product.id,brand,'preview',currentWorkspace())} target="_blank" rel="noopener noreferrer">Abrir página completa em outra aba</a><DeleteProduct request={request} product={product} archived={data.archived} onDone={async()=>{onClose();}}/></div>
 </div>;
}
