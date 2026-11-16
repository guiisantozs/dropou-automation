export function priceCurrent(o:{checkedAt:string},now=Date.now()){const t=Date.parse(o.checkedAt);return Number.isFinite(t)&&t<=now+1000&&now-t<=15*60000;}
