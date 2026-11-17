'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';
import {establishPasswordRecovery,newPasswordError,recoveryPath,saveRecoveredPassword} from '@/lib/password-recovery';

export default function PasswordRecovery({mode}:{mode:'request'|'reset'}){
 const client=useMemo(()=>process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'dropou-password-recovery'}}):null,[]);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[done,setDone]=useState(false);
 const lock=useRef(false),initial=useRef<Promise<boolean>|null>(null);
 useEffect(()=>{
  if(mode!=='reset')return;let live=true;
  function start(){
   const hash=window.location.hash;
   if(hash||!initial.current){window.history.replaceState(null,'',recoveryPath);setReady(false);setDone(false);setPassword('');setConfirmation('');setMessage('');initial.current=client?establishPasswordRecovery(client,hash).catch(()=>false):Promise.resolve(false);}
   const pending=initial.current!;void pending.then(ok=>{if(live&&pending===initial.current){setReady(ok);if(!ok)setMessage('Link inválido ou expirado. Solicite um novo link.');}});
  }
  start();window.addEventListener('hashchange',start);
  return()=>{live=false;window.removeEventListener('hashchange',start);};
 },[client,mode]);
 async function submit(){
  if(lock.current||!client)return;lock.current=true;setBusy(true);setMessage('');
  try{
   if(mode==='request'){
    const r=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:new URL(recoveryPath,window.location.origin).href});
    if(r.error)throw new Error('Não foi possível solicitar o link agora. Aguarde e tente novamente.');
    setEmail('');setDone(true);setMessage('Se houver uma conta para este e-mail, você receberá um link para definir a senha. Confira também a caixa de spam.');
   }else{
    if(!ready)throw new Error('Solicite um novo link de recuperação.');const issue=newPasswordError(password,confirmation);if(issue)throw new Error(issue);
    await saveRecoveredPassword(client,password);setPassword('');setConfirmation('');setReady(false);setDone(true);setMessage('Senha atualizada. Entre no Dropou com sua nova senha.');
   }
  }catch(e){setMessage(e instanceof Error&&/^(Não foi possível|Solicite |Use uma senha|As senhas|Link inválido)/.test(e.message)?e.message:'Não foi possível concluir. Tente novamente ou solicite um novo link.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <main className="login"><section className="login-card"><div className="brand">dropou<span className="brand-dot">.</span></div><h1>{mode==='request'?'Esqueci minha senha':'Definir nova senha'}</h1><p>{mode==='request'?'Informe o e-mail da sua conta para receber o link de recuperação.':'Escolha uma nova senha para a conta do link recebido.'}</p>{!client&&<p role="alert">A recuperação de senha ainda não está configurada neste ambiente.</p>}{!done&&<form method="post" onSubmit={e=>{e.preventDefault();void submit();}}>{mode==='request'?<label>E-mail da conta<input type="email" autoComplete="email" required value={email} maxLength={254} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>:<><label>Nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||!ready}/></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy||!ready}/></label><p>Use de 12 a 128 caracteres e uma senha diferente das usadas em outros serviços.</p></>}<button className="primary" disabled={!client||busy||mode==='reset'&&!ready}>{busy?'Aguarde…':mode==='request'?'Enviar link de recuperação':'Salvar nova senha'}</button></form>}<p role="status" aria-live="polite">{message}</p>{mode==='reset'&&!done&&<p><Link href="/esqueci-senha">Solicitar novo link</Link></p>}<p><Link href="/">Voltar ao Dropou</Link></p></section></main>;
}
