import {Fragment} from 'react';
import {telegramText} from '@/lib/telegram-text';
function linked(value:string){return value.split(/(https?:\/\/[^\s<>]+)/g).map((part,i)=>/^https?:\/\//.test(part)?<a key={i} href={part} target="_blank" rel="noreferrer noopener">{part}</a>:<Fragment key={i}>{part}</Fragment>);}
// Telegram entities and the browser preview share the same UTF-16 offsets.
export default function CaptionContent({text,channel='whatsapp'}:{text:string;channel?:'whatsapp'|'telegram'}){
 const formatted=telegramText(text),parts:React.ReactNode[]=[];let cursor=0;
 formatted.entities.forEach((entity,i)=>{parts.push(<Fragment key={'plain'+i}>{linked(formatted.text.slice(cursor,entity.offset))}</Fragment>);const content=linked(formatted.text.slice(entity.offset,entity.offset+entity.length));parts.push(entity.type==='bold'?<strong key={i}>{content}</strong>:<del key={i}>{content}</del>);cursor=entity.offset+entity.length;});parts.push(<Fragment key="end">{linked(formatted.text.slice(cursor))}</Fragment>);
 return <div className={'message-preview '+channel} aria-label={'Prévia '+(channel==='telegram'?'Telegram':'WhatsApp')}>{parts}</div>;
}
