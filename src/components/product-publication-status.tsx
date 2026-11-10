import {CheckCheck,Clock3,MessageCircle,Send,TriangleAlert} from 'lucide-react';
import type {Channel,ProductChannelSummary} from '@/lib/channel-state';
import {publicationDate} from '@/lib/publication-history';
export default function ProductPublicationStatus({channels}:{channels?:ProductChannelSummary}){
 if(!channels)return <div className="product-publication-status"><small>Publicações não verificadas</small></div>;
 const date=publicationDate;
 return <div className="product-publication-status" aria-label="Publicação por canal">{(['telegram','whatsapp'] as Channel[]).map(channel=>{
  const s=channels[channel],name=channel==='telegram'?'Telegram':'WhatsApp',review=s.review||['blocked','failed','uncertain','partial'].includes(s.state||''),Icon=s.published?CheckCheck:review?TriangleAlert:s.state==='queued'?Clock3:channel==='telegram'?Send:MessageCircle;
  const label=s.published?'Publicado no '+name:s.state==='queued'?name+' agendado':s.state==='sending'?'Publicando no '+name:review?name+': revisar':s.state==='ready'&&channel==='whatsapp'?'WhatsApp pronto para compartilhar':name+': não publicado';
  return <div key={channel}><span className={'badge publication-channel-badge '+(s.published?'status-pronto':review?'status-aguardando-link':'neutral')}><Icon size={13}/>{label}</span>{s.published&&<small>{date(s.publishedAt)}{channel==='whatsapp'?' · confirmação manual':''}</small>}{s.scheduledAt&&<small>{s.published?'Republicação agendada: ':''}{date(s.scheduledAt)}</small>}{s.published&&review&&<small>Nova tentativa precisa de revisão</small>}</div>;
 })}</div>;
}
