// Presentation only. These IDs are never sent to generation, products, queues or integrations.
export const workspaceBrands=[
 {id:'dropou',name:'Dropou',category:'Games & Tecnologia',status:'Ativo',tone:'blue',icon:'gamepad'},
 {id:'bruto',name:'Bruto & Barato',category:'Ferramentas',status:'Em preparação',tone:'orange',icon:'wrench'},
 {id:'moda',name:'Moda Masculina',category:'Nome provisório',status:'Em preparação',tone:'graphite',icon:'shirt'},
] as const;
export type WorkspaceBrandId=typeof workspaceBrands[number]['id'];
