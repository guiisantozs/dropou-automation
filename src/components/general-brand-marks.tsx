import type {CSSProperties} from 'react';

/** Decorative brand marks: surrounding labels always carry the action/state. */
export function ChannelMark({channel,size=15}:{channel:'telegram'|'whatsapp';size?:number}){
 return <span className={'general-brand-mark brand-'+channel} style={{'--mark-size':size+'px'} as CSSProperties} aria-hidden="true"/>;
}
export function MarketplaceBadge({store}:{store:string}){
 return <span className={'general-marketplace-badge '+(store==='Shopee'?'market-shopee':'market-meli')}>
  {store==='Shopee'?<><span className="general-brand-mark brand-shopee" aria-hidden="true"/>Shopee</>:store==='Mercado Livre'?<img className="general-marketplace-logo" src="/brand-marks/mercado-livre.webp" width="65" height="17" alt="Mercado Livre"/>:store}
 </span>;
}
