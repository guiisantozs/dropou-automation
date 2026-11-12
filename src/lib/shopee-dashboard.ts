import {classifyGamingTech} from './shopee-quality';
type Row={id:string;data:{name:string};eligible:boolean;decision:string;score:number};
export function gamerDashboardRows<T extends Row>(rows:T[],filter:string,selected=new Set<string>()){
 const audit=filter==='rejected'||filter==='removed';
 return rows.filter(row=>classifyGamingTech(row.data.name).relevant&&(audit?row.decision===filter:!['rejected','removed'].includes(row.decision)&&(filter==='all'||filter==='eligible'&&row.eligible||filter==='ineligible'&&!row.eligible||filter==='selected'&&selected.has(row.id)||row.decision===filter))).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
