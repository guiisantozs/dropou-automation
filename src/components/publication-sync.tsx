'use client';
import {useEffect} from 'react';
import {supabase} from '@/lib/supabase';
import {notifyPublicationChange,publicationChangeEvent} from '@/lib/publication-sync';
export default function PublicationSync(){
 useEffect(()=>{
  if(!supabase)return;
  let user:string|undefined,channel:ReturnType<typeof supabase.channel>|undefined,disposed=false,remote=false,authChanged=false;
  const bus=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('dropou-publication-updates'):undefined;
  const receive=()=>{remote=true;notifyPublicationChange();remote=false;};
  if(bus)bus.onmessage=receive;
  const broadcast=()=>{if(!remote&&user)bus?.postMessage({changed:true});};
  window.addEventListener(publicationChangeEvent,broadcast);
  function connect(id?:string){if(disposed||id===user)return;if(channel){void supabase!.removeChannel(channel);channel=undefined;}user=id;if(!id)return;
   channel=supabase!.channel('publication-updates-'+id).on('postgres_changes',{event:'*',schema:'public',table:'publication_updates'},receive).subscribe();
  }
  void supabase.auth.getSession().then(r=>{if(!authChanged)connect(r.data.session?.user.id);});
  const auth=supabase.auth.onAuthStateChange((_event,session)=>{authChanged=true;queueMicrotask(()=>connect(session?.user.id));});
  const refresh=()=>{if(user&&document.visibilityState==='visible')receive();};
  window.addEventListener('focus',refresh);const poll=setInterval(refresh,30000);
  return()=>{disposed=true;clearInterval(poll);window.removeEventListener('focus',refresh);window.removeEventListener(publicationChangeEvent,broadcast);bus?.close();auth.data.subscription.unsubscribe();if(channel)void supabase!.removeChannel(channel);};
 },[]);return null;
}
