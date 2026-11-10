import {z} from 'zod';
export const operationSchema=z.enum(['dropou','bruto','moda']);
export const operationScopeSchema=z.enum(['dropou','bruto','moda','all']);
export type OperationId=z.infer<typeof operationSchema>;
export type OperationScope=z.infer<typeof operationScopeSchema>;
export const workspaceBrands=[
 {id:'dropou',name:'Dropou',category:'Games & Tecnologia',status:'Ativo',tone:'blue',icon:'gamepad'},
 {id:'bruto',name:'Bruto & Barato',category:'Ferramentas',status:'Ativo',tone:'orange',icon:'wrench'},
 {id:'moda',name:'Moda Masculina',category:'Nome editável',status:'Ativo',tone:'graphite',icon:'shirt'},
 {id:'all',name:'Todas as operações',category:'Visão administrativa',status:'Consolidado',tone:'blue',icon:'gamepad'},
] as const;
export type WorkspaceBrandId=typeof workspaceBrands[number]['id'];
export const operationCategories={dropou:['Games','Consoles','Computadores','Periféricos','Tecnologia'],bruto:['Ferramentas','Equipamentos','Manutenção','Oficina','Automotivos','Construção'],moda:['Roupas','Tênis','Acessórios','Relógios','Estilo masculino']} as const;
export const operationCopy={dropou:{headline:'🎮🔥 CONFIRA ESSE ACHADO GAMER! #publi',generic:'Seleção de games e tecnologia',closing:'💙 Dropou o preço? A gente te avisa!'},bruto:{headline:'🛠️ CONFIRA ESSE ACHADO PARA SUA OFICINA! #publi',generic:'Seleção de ferramentas e utilidades',closing:'🛠️ Bruto & Barato — ferramenta certa para o seu dia!'},moda:{headline:'👔 CONFIRA ESSE ACHADO DE ESTILO! #publi',generic:'Seleção de moda masculina',closing:'🖤 Estilo e custo-benefício para o seu dia.'}} as const;
export const operationName=(id:string)=>workspaceBrands.find(b=>b.id===id)?.name||id;
export function selectedOperation():OperationScope{if(typeof window==='undefined')return 'dropou';const raw=new URLSearchParams(window.location.search).get('brand')||window.sessionStorage.getItem('dropou.operation')||'dropou';return operationScopeSchema.catch('dropou').parse(raw);}
export function selectOperation(id:OperationScope){if(typeof window==='undefined')return;window.sessionStorage.setItem('dropou.operation',id);const url=new URL(window.location.href);url.searchParams.set('brand',id);window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
export function operationForRequest(request:Request):OperationScope{return operationScopeSchema.parse(new URL(request.url).searchParams.get('brand')||request.headers.get('x-dropou-brand')||'dropou');}
