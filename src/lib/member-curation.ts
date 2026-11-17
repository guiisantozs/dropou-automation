import type {OperationId} from './workspace-brands';

// Product types, rather than generic audience words, define each niche.
const unsafe=/\b(ferramentas?|furadeira|parafusadeira|automotiv\w*|veicular|motociclet\w*|videogame|playstation|xbox|smartphone|iphone|celular|notebook|gamer|hospital\w*|medicamento|suplemento|replica|falsificado)\b/;
export const memberCurationProfiles={
 beleza:{
  keywords:['kit maquiagem','batom feminino','base corretivo maquiagem','serum facial skincare','hidratante corporal feminino','perfume feminino','shampoo mascara capilar','kit manicure unhas','pincel maquiagem'],
  categories:[['Maquiagem',/\b(maquiagem|batom|batons|base facial|base liquida|corretivo|rimel|mascara de cilios|paleta de sombras|blush|delineador|gloss|pincel de maquiagem)\b/],['Skincare e autocuidado',/\b(skincare|serum facial|hidratante|creme (?:facial|corporal|para (?:pele|rosto|maos))|protetor solar|sabonete facial|limpeza facial|esfoliante|agua micelar)\b/],['Perfumes femininos',/\bperfume feminino\b|\bbody splash\b/],['Cabelo',/\b(shampoo|condicionador|mascara capilar|oleo capilar|escova de cabelo|secador de cabelo|chapinha|touca de cetim|presilha|tratamento capilar)\b/],['Manicure e acessórios',/\b(manicure|esmalte|unhas|lixa de unha|alicate de cuticula|esponja de maquiagem|necessaire|kit beleza)\b/]],
  negative:/\b(perfume masculino|barbeador|barba|produto veterinario|pet|cao|cachorro|boneca|brinquedo|camiseta|vestido)\b/,
  minPrice:3,maxPrice:450,
 },
 casa:{
  keywords:['vaso decorativo','flores artificiais decoracao','quadro decorativo','espelho decorativo','luminaria abajur','tapete sala','capa almofada decorativa','organizador banheiro','prateleira decorativa','cortina sala'],
  categories:[['Objetos decorativos',/\b(vaso decorativo|vasos decorativos|flores artificiais|quadro decorativo|quadros decorativos|espelho decorativo|objeto decorativo|decoracao minimalista|escultura decorativa)\b/],['Iluminação',/\b(luminaria|abajur)\b/],['Têxteis para o lar',/\b(tapete|almofada|manta|cortina|capa de sofa)\b/],['Organização e ambientes',/\b(prateleira|organizador(?:es)?|cesto organizador|porta (?:tempero|sabonete|toalha|escova)|kit banheiro|decoracao (?:de |para )?(?:quarto|sala|cozinha|banheiro))\b/]],
  negative:/\b(geladeira|refrigerador|maquina de lavar|microondas|fogao|ar condicionado|televisao|tv|aspirador|panela eletrica|air fryer|eletrodomestico|brinquedo|roupa|vestido|peca de reposicao|pecas de reposicao|natal|natalino|natalina|papai noel|organizador de cabos pc)\b/,
  minPrice:5,maxPrice:600,
 },
 natal:{
  keywords:['arvore de natal','kit bolas natalinas','guirlanda natal','pisca pisca natal','papai noel decorativo','lacos arvore natal','capa almofada natalina','meia natalina decorativa','enfeites natalinos mesa'],
  categories:[['Árvores e acessórios',/\b(arvore|arvores|miniarvore|miniarvores|mini arvore|bolas?|lacos?|estrela|saia para arvore)\b/],['Luzes',/\b(pisca pisca|cordao de luz|cordoes de luz|luzes|luminaria)\b/],['Enfeites natalinos',/\b(guirlandas?|papai noel|bonecos?|enfeites?|ornamentos?|decoracao|almofadas?|meia natalina|meias natalinas|mesa posta|kit natalino)\b/]],
  negative:/\b(presente|camiseta|roupa|vestido|pijama|fantasia|perfume|chocolate|panetone|chocotone|brinquedo|boneca|tenis|calcado|caneca|cartao presente)\b/,
  minPrice:3,maxPrice:1000,
 },
} satisfies Record<string,{keywords:string[];categories:[string,RegExp][];negative:RegExp;minPrice:number;maxPrice:number}>;
export type MemberCurationId=keyof typeof memberCurationProfiles;
export function memberCurationProfile(operation:string){return memberCurationProfiles[operation as MemberCurationId];}
export function memberClassification(name:string,operation:OperationId){
 const profile=memberCurationProfile(operation);if(!profile)return null;
 const title=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-–]/g,' ');
 const category=profile.categories.find(([,pattern])=>pattern.test(title))?.[0]||'';
 const seasonal=operation!=='natal'||/\b(natal|natalin[oa]s?|papai noel)\b/.test(title);
 const homeContext=operation!=='casa'||!/\borganizador(?:es)?\b/.test(title)||/\b(casa|lar|banheiro|cozinha|quarto|sala|decorativ[oa]s?|gaveta|armario|closet|prateleira)\b/.test(title);
 const relevant=!!category&&seasonal&&homeContext&&!unsafe.test(title)&&!profile.negative.test(title);
 return {relevant,category:relevant?category:''};
}
// Keep quantity, volume, color and shade: these can identify different kits/variants.
export function memberFingerprint(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
