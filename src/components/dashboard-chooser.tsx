'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Car,Footprints,Gamepad2,House,Layers,Shirt,Sparkles,TreePine,Wrench,Smartphone} from 'lucide-react';
import {workspaceBrands,operationDescriptions,type WorkspaceBrandId} from '@/lib/workspace-brands';
import {greeting} from '@/lib/dashboard-access';
const icons={gamepad:Gamepad2,wrench:Wrench,shirt:Shirt,phone:Smartphone,shoe:Footprints,car:Car,sparkles:Sparkles,house:House,tree:TreePine};
export default function DashboardChooser({name,allowed,names={},onChoose}:{name:string;allowed:WorkspaceBrandId[];names?:Partial<Record<WorkspaceBrandId,string>>;onChoose:(id:WorkspaceBrandId)=>void}){
 const [welcome,setWelcome]=useState('Olá'+(name?', '+name:'')+'!');
 useEffect(()=>{const update=()=>setWelcome(greeting(name));update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[name]);
 return <section className="dashboard-chooser"><header><span className="eyebrow">SEU ESPAÇO DROPOU</span><h1>{welcome}</h1><p>Bom te ver por aqui! Vamos encontrar boas ofertas hoje?</p></header><div className="dashboard-choice-heading"><h2>Seus dashboards</h2><span>{allowed.length} disponíveis</span></div><div className="dashboard-choice-grid">{workspaceBrands.filter(b=>allowed.includes(b.id)).map(b=>{const Icon=b.id==='all'?Layers:icons[b.icon];return <button className="dashboard-choice-card" data-operation={b.id} key={b.id} onClick={()=>onChoose(b.id)}><span className="dashboard-choice-icon"><Icon size={25}/></span><ArrowUpRight className="dashboard-choice-arrow" size={20}/><h3>{names[b.id]||b.name}</h3><p>{operationDescriptions[b.id]||b.category}</p><span className="dashboard-choice-open">Abrir dashboard <ArrowUpRight size={14}/></span></button>;})}</div>{!allowed.length&&<p role="status">Nenhum dashboard liberado. Peça ao administrador para conferir seu acesso.</p>}</section>;
}
