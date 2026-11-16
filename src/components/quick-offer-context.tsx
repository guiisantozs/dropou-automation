'use client';
import {createContext,useCallback,useContext,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type MutableRefObject} from 'react';
import dynamic from 'next/dynamic';
import {Send,X} from 'lucide-react';
import type {Product} from '@/lib/domain';
import {operationSchema,type OperationId,type OperationScope} from '@/lib/workspace-brands';
import Dialog from './dialog';
import ProductMedia from './product-media';
export type QuickOfferTarget={id:string;operation:OperationId;intent?:'preview'|'telegram'|'schedule'|'edit';product?:Product;history?:boolean;repost?:boolean};
type State={open:(target:Omit<QuickOfferTarget,'operation'>&{operation:string})=>boolean;target?:QuickOfferTarget;close:()=>void;attempts:Set<string>};
const Context=createContext<State|null>(null);
export const useQuickOffer=()=>useContext(Context);
function Loading(){const state=useQuickOffer();return <Dialog labelledBy="quick-offer-title" className="quick-offer-modal"><div className="quick-offer-heading"><span className="quick-offer-heading-icon"><Send size={32}/></span><div><h2 id="quick-offer-title">Publicar oferta</h2><p>Confira e publique em poucos cliques</p></div><button aria-label="Fechar" onClick={state?.close}><X size={22}/></button></div>{state?.target?.product&&<div className="quick-offer-product"><ProductMedia product={state.target.product}/><div><h3>{state.target.product.name}</h3></div></div>}<div className="quick-offer-skeleton" role="status">Carregando publicação…</div></Dialog>;}
const QuickOfferModal=dynamic(()=>import('./quick-offer-modal'),{loading:Loading});
export function QuickOfferProvider({children,allowed,bind}:{children:ReactNode;allowed?:OperationScope[];bind?:MutableRefObject<State['open']|null>}){
 const [target,setTarget]=useState<QuickOfferTarget>(),attempts=useRef(new Set<string>());
 const open=useCallback((value:Parameters<State['open']>[0])=>{const parsed=operationSchema.safeParse(value.operation);if(!parsed.success||value.id==='nova'||allowed&&!allowed.includes(parsed.data))return false;setTarget({...value,operation:parsed.data});return true;},[allowed]);
 const close=useCallback(()=>setTarget(undefined),[]);
 useLayoutEffect(()=>{if(bind)bind.current=open;return()=>{if(bind?.current===open)bind.current=null;};},[bind,open]);
 const state=useMemo(()=>({open,target,close,attempts:attempts.current}),[open,target,close]);
 return <Context.Provider value={state}>{children}</Context.Provider>;
}
/** Render inside the origin shell, so all CSS tokens (including the light scope) inherit. */
export function QuickOfferOutlet(){const state=useQuickOffer();return state?.target?<QuickOfferModal key={state.target.operation+':'+state.target.id} target={state.target} onClose={state.close} attempts={state.attempts}/>:null;}
