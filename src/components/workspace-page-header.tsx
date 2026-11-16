'use client';
import {Bell,ChevronDown,Plus,Search} from 'lucide-react';
import {operationName,type OperationScope} from '@/lib/workspace-brands';
const descriptions:Record<string,string>={
 'Visão geral':'Sua operação, produtos e publicações em um só lugar.',
 'Curadoria':'Revise os achados e escolha as próximas ofertas do seu canal.',
 'Buscar ofertas':'Encontre produtos e prepare sua próxima seleção.',
 'Automação de Ofertas':'Acompanhe suas buscas, critérios e limites de consumo.',
 'Catálogo de produtos':'Seus produtos e históricos, organizados por canal.',
 'Fila de ofertas':'Acompanhe as publicações confirmadas de cada destino.',
 'Agendamento':'Organize os próximos horários, sem misturar os destinos.',
 'Integrações':'Gerencie seus canais, integrações e preferências.',
 'Logs de atividade':'Acompanhe os registros e as ações da sua operação.',
 'Consumo de IA':'Gerencie as legendas e acompanhe o consumo disponível.',
};
export default function WorkspacePageHeader({view,operation,displayName,onCreate,onSearch,onActivity,onSettings,onSignOut}:{view:string;operation:OperationScope;displayName?:string;onCreate:()=>void;onSearch:()=>void;onActivity:()=>void;onSettings:()=>void;onSignOut?:()=>void}){
 const title=view==='Visão geral'?'Dashboard':view==='Agendamento'?'Agendamentos':view==='Fila de ofertas'?'Publicações':view==='Integrações'?'Configurações':view==='Automação de Ofertas'?'Busca e consumo':view;
 return <header className="workspace-page-header"><div className="workspace-page-title"><span>{displayName||operationName(operation)}</span><h1>{title}</h1><p>{descriptions[view]||'Organize sua operação e acompanhe cada publicação.'}</p></div><div className="workspace-page-actions"><button className="workspace-create" onClick={onCreate}><Plus size={16}/>Criar oferta</button><button className="workspace-header-icon" aria-label="Buscar produtos no catálogo" title="Buscar no catálogo" onClick={onSearch}><Search size={19}/></button><button className="workspace-header-icon" aria-label="Notificações e atividade" title="Atividade recente" onClick={onActivity}><Bell size={19}/></button><details className="workspace-profile"><summary aria-label="Perfil da conta"><span>DP</span><ChevronDown size={14}/></summary><div><b>Conta Dropou</b><span>{displayName||operationName(operation)}</span><button onClick={onSettings}>Configurações</button>{onSignOut&&<button onClick={onSignOut}>Sair da conta</button>}</div></details></div></header>;
}
