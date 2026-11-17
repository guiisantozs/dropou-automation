import type {SavedPublication} from './saved-publication';
export function scheduleDate(at:string){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at)).replace(',',' às');}
/** Real queue state is independent of curation and previous channel publications. */
export function productScheduleState(value:SavedPublication|undefined,now=Date.now()){
 const jobs=(value?.jobs||[]).filter(j=>j.channel==='telegram'&&!['sent','cancelled'].includes(j.state)).sort((a,b)=>Date.parse(b.scheduled_at)-Date.parse(a.scheduled_at));
 const job=jobs[0],summary=value?.channels?.telegram;
 const state=job?.state||(!summary?.published?summary?.state:null),at=job?.scheduled_at||summary?.scheduledAt;
 if(!state||!['queued','ready','blocked','failed','sending','uncertain','partial'].includes(state))return null;
 const late=['queued','ready'].includes(state)&&!!at&&Date.parse(at)<=now;
 const review=['blocked','failed','uncertain','partial'].includes(state);
 const label=state==='blocked'?'Precisa de revisão':state==='failed'?'Falhou':state==='uncertain'?'Entrega incerta':state==='partial'?'Envio parcial':state==='sending'?'Publicando':late?'Atrasado':'Agendado';
 return {state,label,at,destination:job?.destination_title||'Telegram',error:job?.error,review,late,detail:label+(at?' · '+scheduleDate(at):'')+' · Telegram'};
}
