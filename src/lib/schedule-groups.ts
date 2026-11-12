export function scheduleGroup(job:{state:string;scheduled_at:string},now=Date.now()){
 if(['sent','cancelled'].includes(job.state))return 'history';
 const at=Date.parse(job.scheduled_at);
 if(job.state!=='queued'||!Number.isFinite(at)||at<=now)return 'pending';
 const day=(t:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 return day(at)===day(now)?'today':'upcoming';
}
