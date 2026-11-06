'use client';
import {useEffect} from 'react';
export default function UnsavedChanges({dirty}:{dirty:boolean}){
 useEffect(()=>{if(!dirty)return;
  const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  const click=(e:MouseEvent)=>{const a=(e.target as Element).closest?.('a[href]') as HTMLAnchorElement|null;if(a&&a.target!=='_blank'&&a.origin===location.origin&&a.href!==location.href&&!window.confirm('Há alterações não salvas. Sair desta oferta?')){e.preventDefault();e.stopPropagation();}};
  window.addEventListener('beforeunload',before);document.addEventListener('click',click,true);
  return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('click',click,true);};
 },[dirty]);return null;
}
