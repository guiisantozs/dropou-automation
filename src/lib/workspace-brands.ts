import {z} from 'zod';
export const operationSchema=z.enum(['dropou','bruto','moda','celulares','tenis','automoto','beleza','casa','natal','kess','primeiro-lar']);
export const operationScopeSchema=z.enum([...operationSchema.options,'all']);
export type OperationId=z.infer<typeof operationSchema>;
export type OperationScope=z.infer<typeof operationScopeSchema>;
export const workspaceBrands=[
 {id:'dropou',name:'Dropou',category:'Games & Tecnologia',status:'Ativo',tone:'blue',icon:'gamepad'},
 {id:'bruto',name:'Bruto & Barato',category:'Ferramentas',status:'Ativo',tone:'orange',icon:'wrench'},
 {id:'moda',name:'Moda Masculina',category:'Nome editável',status:'Ativo',tone:'graphite',icon:'shirt'},
 {id:'celulares',name:'Dropou | Celulares & Gadgets',category:'Celulares e acessórios',status:'A configurar',tone:'orange',icon:'phone'},
 {id:'tenis',name:'Dropou | Tênis & Sneakers',category:'Tênis e sneakers',status:'A configurar',tone:'orange',icon:'shoe'},
 {id:'automoto',name:'Dropou | Auto & Moto',category:'Acessórios automotivos',status:'A configurar',tone:'orange',icon:'car'},
 {id:'beleza',name:'Toque de Beleza',category:'Beleza e autocuidado',status:'Shopee · Telegram manual',tone:'berry',icon:'sparkles'},
 {id:'casa',name:'Cantinho & Charme',category:'Casa e decoração',status:'Shopee · Telegram manual',tone:'lilac',icon:'house'},
 {id:'natal',name:'Clima de Natal',category:'Decoração natalina',status:'Shopee · Telegram manual',tone:'green',icon:'tree'},
 {id:'kess',name:'Achadinhos da Kess',category:'Achadinhos e utilidades',status:'Shopee · Telegram manual',tone:'berry',icon:'sparkles'},
 {id:'primeiro-lar',name:'Nosso Primeiro Lar | Enxoval & Casa Nova',category:'Enxoval e primeira casa',status:'Shopee · Telegram manual',tone:'blue',icon:'house'},
 {id:'all',name:'Todas as operações',category:'Visão administrativa',status:'Consolidado',tone:'blue',icon:'gamepad'},
] as const;
export type WorkspaceBrandId=typeof workspaceBrands[number]['id'];
export const karenOperations=['beleza','casa','natal'] as const;
export const kesiaOperations=['kess','primeiro-lar'] as const;
export const memberOperations=[...karenOperations,...kesiaOperations] as const;
export function isLocalOperation(id:string):id is typeof memberOperations[number]{return (memberOperations as readonly string[]).includes(id);}
export const operationDescriptions:Partial<Record<OperationScope,string>>={kess:'Achadinhos úteis, populares e com evidências para o seu dia a dia.','primeiro-lar':'Essenciais de cozinha, enxoval e organização para construir seu primeiro lar.',beleza:'Seus melhores achadinhos de beleza e autocuidado.',casa:'Achadinhos para deixar sua casa ainda mais bonita.',natal:'Os melhores achadinhos para um Natal especial.'};
export const operationCategories={kess:['Utilidades domésticas','Organização','Celular e eletrônicos acessíveis','Acessórios e presentes úteis','Dia a dia'],'primeiro-lar':['Cozinha','Quarto e enxoval','Banheiro','Lavanderia e limpeza','Organização da primeira casa'],dropou:['Games','Consoles','Computadores','Periféricos','Tecnologia'],bruto:['Ferramentas','Equipamentos','Manutenção','Oficina','Automotivos','Construção'],moda:['Roupas','Tênis','Acessórios','Relógios','Estilo masculino'],celulares:['Smartphones','Carregadores e cabos','Fones Bluetooth','Acessórios e gadgets'],tenis:['Tênis casuais','Tênis esportivos','Corrida','Sneakers'],automoto:['Acessórios para carros','Acessórios para motos','Limpeza automotiva','Manutenção'],beleza:['Maquiagem','Skincare','Perfumes','Cabelo','Autocuidado'],casa:['Decoração','Organização','Cozinha','Iluminação','Móveis','Utilidades domésticas'],natal:['Árvores','Luzes','Guirlandas','Enfeites','Decoração natalina']} as const;
export const operationCopy={kess:{headline:'🛍️ UM ACHADINHO PARA O SEU DIA! #publi',generic:'Seleção de achadinhos e utilidades',closing:'#publi | Achadinhos da Kess'},'primeiro-lar':{headline:'🏡 UM ESSENCIAL PARA O SEU PRIMEIRO LAR! #publi',generic:'Seleção de enxoval e primeira casa',closing:'#publi | Nosso Primeiro Lar'},dropou:{headline:'🎮🔥 CONFIRA ESSE ACHADO GAMER! #publi',generic:'Seleção de games e tecnologia',closing:'💙 Dropou o preço? A gente te avisa!'},bruto:{headline:'🛠️ CONFIRA ESSE ACHADO PARA SUA OFICINA! #publi',generic:'Seleção de ferramentas e utilidades',closing:'🛠️ Bruto & Barato — ferramenta certa para o seu dia!'},moda:{headline:'👔 CONFIRA ESSE ACHADO DE ESTILO! #publi',generic:'Seleção de moda masculina',closing:'🖤 Estilo e custo-benefício para o seu dia.'},celulares:{headline:'📱 UM ACHADO PARA O SEU DIA! #publi',generic:'Seleção de celulares e gadgets',closing:'📱 #publi | Dropou Celulares & Gadgets'},tenis:{headline:'👟 SEU PRÓXIMO PASSO ESTÁ AQUI! #publi',generic:'Seleção de tênis e sneakers',closing:'👟 #publi | Dropou Tênis & Sneakers'},automoto:{headline:'🚗 UM ACHADO PARA O SEU VEÍCULO! #publi',generic:'Seleção de acessórios para carro e moto',closing:'🚗 #publi | Dropou Auto & Moto'},beleza:{headline:'✨ UM TOQUE DE AUTOCUIDADO! #publi',generic:'Seleção de beleza e autocuidado',closing:'#publi | Toque de Beleza'},casa:{headline:'🏡 UM CHARME PARA SUA CASA! #publi',generic:'Seleção de casa e decoração',closing:'#publi | Cantinho & Charme'},natal:{headline:'🎄 UM ACHADINHO PARA O SEU NATAL! #publi',generic:'Seleção de decoração natalina',closing:'#publi | Clima de Natal'}} as const;
export const operationName=(id:string)=>workspaceBrands.find(b=>b.id===id)?.name||id;
export function selectedOperation():OperationScope{if(typeof window==='undefined')return 'dropou';const raw=new URLSearchParams(window.location.search).get('brand')||window.sessionStorage.getItem('dropou.operation')||'dropou';return operationScopeSchema.catch('dropou').parse(raw);}
export function selectOperation(id:OperationScope){if(typeof window==='undefined')return;window.sessionStorage.setItem('dropou.operation',id);const url=new URL(window.location.href);url.searchParams.set('brand',id);window.history.replaceState(null,'',url.pathname+url.search+url.hash);document.documentElement.dataset.operation=id;window.dispatchEvent(new window.Event('dropou:operation-change'));}
export function operationForRequest(request:Request):OperationScope{return operationScopeSchema.parse(new URL(request.url).searchParams.get('brand')||request.headers.get('x-dropou-brand')||'dropou');}

export function isShopeeOperation(value:string):value is 'dropou'|'celulares'|'tenis'|'automoto'|'beleza'|'casa'|'natal'|'kess'|'primeiro-lar'{return ['dropou','celulares','tenis','automoto','beleza','casa','natal','kess','primeiro-lar'].includes(value);}
