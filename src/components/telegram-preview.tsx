'use client';
import {useEffect,useId,useState} from 'react';
import type {Product} from '@/lib/domain';
import {privateImageUrl} from '@/lib/private-image';
import {telegramMessageCount,telegramPresentationError,type TelegramPresentation} from '@/lib/telegram-presentation';
import CaptionContent from './caption-content';
export function PublicationPhoto({product}:{product:Product}){
 const [url,setUrl]=useState(product.imagePath?'':product.image),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setFailed(false);setUrl(product.imagePath?'':product.image);if(product.imagePath)privateImageUrl(product.imagePath).then(url=>{if(active)setUrl(url);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[product.imagePath,product.image]);
 return url&&!failed?<img className="publication-cover" src={url} alt={'Foto para publicação: '+product.name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="publication-cover-missing">{failed?'A foto não carregou. Confira o arquivo antes de publicar.':'Adicione uma foto para publicar com capa acima da legenda.'}</div>;
}
export function TelegramMediaOptions({product,value,onChange}:{product:Product;value:TelegramPresentation;onChange:(value:TelegramPresentation)=>void}){
 const group=useId();return <fieldset className="telegram-media-options"><legend>Apresentação no Telegram</legend>{[['photo','Foto acima da legenda'],['link_preview','Solicitar prévia do link acima do texto'],['text','Publicar somente texto, sem prévia']].map(([mode,label])=><label className="check-label" key={mode}><input type="radio" name={group} checked={value.mediaMode===mode} onChange={()=>onChange({...value,mediaMode:mode as TelegramPresentation['mediaMode']})}/>{label}</label>)}{value.mediaMode==='photo'&&<label className="check-label"><input type="checkbox" checked={value.photoConfirmed} onChange={e=>onChange({...value,photoConfirmed:e.target.checked})}/>Confirmo que esta foto é autorizada e não contém preços, descontos ou estoque escritos que possam ficar desatualizados.</label>}{telegramPresentationError(product,value)&&<p className="fine-print">{telegramPresentationError(product,value)}</p>}{value.mediaMode==='link_preview'&&<p className="fine-print">O Telegram decide se gera uma prévia. A foto no topo não é garantida nesta opção.</p>}</fieldset>;
}
export default function TelegramPreview({product,text,presentation}:{product:Product;text:string;presentation:TelegramPresentation}){
 return <div className="telegram-publication-preview">{presentation.mediaMode==='photo'?<PublicationPhoto product={product}/>:presentation.mediaMode==='link_preview'?<div className="publication-preview-request">Prévia do link solicitada acima · depende do Telegram</div>:<p className="fine-print">Somente texto · sem foto ou prévia automática</p>}<CaptionContent text={text} channel="telegram"/>{telegramMessageCount(text,presentation.mediaMode)===2&&<p className="section-note">A legenda excede 1.024 caracteres. Serão duas mensagens vinculadas: foto primeiro e texto completo abaixo, preservando o link. Uma falha parcial ficará bloqueada para revisão, sem repetição automática.</p>}</div>;
}
