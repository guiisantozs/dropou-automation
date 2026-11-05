'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
export default function MercadoLivreConnection(){
 const [status,setStatus]=useState('Verificando configuração OAuth…'),[busy,setBusy]=useState(false),[redirect,setRedirect]=useState('');
 useEffect(()=>{api<{connected:boolean;status:string;redirectUri:string}>('/api/integrations/mercado-livre/status').then(s=>{setStatus(s.connected?'Autorização OAuth armazenada. Permissões de busca ainda precisam ser verificadas.':`OAuth: ${s.status}`);setRedirect(s.redirectUri);}).catch(e=>setStatus((e as Error).message));},[]);
 return <><p className="fine-print muted">{status}</p>{redirect&&<p className="fine-print muted">URI de redirect: {redirect}</p>}<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const data=await api<{authorizationUrl:string}>('/api/integrations/mercado-livre/connect','POST');const u=new URL(data.authorizationUrl);if(u.origin!=='https://auth.mercadolivre.com.br')throw new Error('URL de autorização inválida.');window.location.assign(u.href);}catch(e){setStatus((e as Error).message);setBusy(false);}}}>Conectar Mercado Livre com OAuth</button></>;
}
