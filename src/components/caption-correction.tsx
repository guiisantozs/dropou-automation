'use client';
import {useState} from 'react';
import type {Product} from '@/lib/domain';
import {captionCorrection} from '@/lib/caption-repair';
import {publicationCaptionError} from '@/lib/publication-copy';
export default function CaptionCorrection({text,product,onAccept,disabled=false,allowUnchanged=false}:{text:string;product:Product;onAccept:(text:string)=>void;disabled?:boolean;allowUnchanged?:boolean}){
 const [open,setOpen]=useState(false),proposal=captionCorrection(text,product)||(allowUnchanged&&!publicationCaptionError(text,product,'verified')?{before:text,after:text,reason:'Confira a legenda e os dados aprovados antes de confirmar uma nova data.'}:null);
 if(!proposal)return null;
 return <section className="caption-correction"><p>{proposal.reason}</p><button type="button" disabled={disabled} onClick={()=>setOpen(v=>!v)}>Corrigir legenda</button>{open&&<><div><h4>Antes</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{proposal.before}</pre><h4>Depois · versão para confirmar</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{proposal.after}</pre></div><p>Esta proposta altera somente a prévia. Salvar ou reagendar exige sua confirmação. Preço e disponibilidade precisam continuar conferidos.</p><button type="button" disabled={disabled} onClick={()=>{onAccept(proposal.after);setOpen(false);}}>Usar esta versão na prévia</button></>}</section>;
}
