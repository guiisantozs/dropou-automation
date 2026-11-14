import type {OperationId} from './workspace-brands';
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const channelProfiles={
 celulares:{keywords:['smartphone samsung','iphone apple','motorola smartphone','xiaomi smartphone','carregador usb c baseus','power bank anker','fone bluetooth jbl','capa iphone','suporte celular'],allow:/\b(smartphone|iphone|celular|power ?bank|fone|earbuds|smartwatch|smartband|gadget)\b|\b(carregador|cabo|capa|capinha|pelicula|suporte|adaptador)\b.*\b(usb|tipo c|iphone|samsung|celular|smartphone|xiaomi|motorola)\b/,deny:/\b(tenis|sapato|automotivo|veicular|carro|moto|cozinha|furadeira|brinquedo|miniatura|replica|falsificado)\b/},
 tenis:{keywords:['tenis nike','tenis adidas','tenis puma','tenis olympikus','tenis fila corrida','tenis casual feminino','sneaker masculino'],allow:/\b(tenis|sneaker|sneakers)\b/,deny:/\b(mesa|raquete|bola|meia|palmilha|cad ar co|cadarco|chaveiro|miniatura|infantil boneca|replica|falsificado|primeira linha|primeira qualidade|inspirado|similar|tipo nike|tipo adidas|celular|automotivo)\b/},
 automoto:{keywords:['suporte celular veicular','carregador veicular usb','camera de re carro','organizador automotivo','limpeza automotiva','aspirador carro','acessorio motociclista','iluminacao automotiva'],allow:/\b(automotivo|automotiva|veicular|carro|carros|moto|motos|motocicleta|motociclista|capacete)\b/,deny:/\b(tenis|sapato|cozinha|brinquedo|miniatura|replica|falsificado|motorola)\b|\b(freio|pastilha|embreagem|pneu|amortecedor|correia|filtro oleo|vela ignicao|peca universal)\b/},
} as const;
export function channelClassification(name:string,brand:OperationId){
 const profile=channelProfiles[brand as keyof typeof channelProfiles];
 if(!profile)return null;
 const title=norm(name),motorola=brand==='celulares'&&/\bmotorola\b/.test(title);
 const relevant=profile.allow.test(title)&&!(motorola?profile.deny.test(title.replace(/\bmoto\b/g,'')):profile.deny.test(title))
  &&!(brand==='automoto'&&/^\s*(smartphone|celular|iphone)\b/.test(title));
 let category:string=brand==='tenis'?(/corrida|running/.test(title)?'Corrida':/esport|treino/.test(title)?'Esportivos':'Casual e sneakers'):brand==='automoto'?(/moto|capacete/.test(title)?'Moto':/limpeza|aspirador/.test(title)?'Limpeza':/carregador|camera|iluminacao/.test(title)?'Eletrônicos automotivos':'Acessórios para carros'):/smartphone|iphone|celular (?:samsung|motorola|xiaomi)/.test(title)?'Smartphones':/fone|earbuds/.test(title)?'Áudio':/capa|capinha|pelicula/.test(title)?'Proteção':/carregador|cabo|power ?bank/.test(title)?'Carregamento':'Gadgets e acessórios';
 return {relevant,category:relevant?category:''};
}
