import type {Product} from './domain';

export const dropouCalls={
 games:['🔥 ESSE JOGO NÃO PODE FALTAR NA SUA COLEÇÃO!','🎮 HORA DE AUMENTAR SUA BIBLIOTECA DE JOGOS!','🔥 OLHA ESSE ACHADO PRA QUEM CURTE VIDEOGAME!','🎮 UM NOVO GAME PRA SUA COLEÇÃO!'],
 consoles:['🔥 SUA PRÓXIMA GAMEPLAY COMEÇA AQUI!','🎮 OLHA ESSE CONSOLE PRA SUA LISTA!','🔥 BORA CONHECER SEU PRÓXIMO VIDEOGAME?','🎮 UM ACHADO PRA QUEM CURTE JOGAR!'],
 controls:['🔥 SEU PRÓXIMO CONTROLE TÁ AQUI!','🕹️ BORA DAR AQUELE UPGRADE NO SETUP?','🔥 UM ACHADO DESSES MERECE ATENÇÃO!','🕹️ MAIS CONFORTO PRA SUA GAMEPLAY!'],
 peripherals:['🔥 OLHA ESSE ACHADO PRO SETUP!','⌨️ SEU SETUP MERECE ESSE UPGRADE!','🔥 ESSE PERIFÉRICO TÁ CHAMANDO ATENÇÃO!','🎧 BORA MELHORAR ESSE SETUP?'],
 hardware:['🔥 HORA DE DAR UM UPGRADE NO PC!','🖥️ OLHA ESSA PEÇA PRO SEU SETUP!','🔥 SEU PRÓXIMO UPGRADE PODE ESTAR AQUI!','🖥️ UM COMPONENTE PRA SUA LISTA!'],
 tech:['🔥 OLHA ESSE ACHADO TECH!','📱 TECNOLOGIA PRA FACILITAR O DIA!','🔥 MAIS UM GADGET PRA SUA LISTA!','📱 ESSE ACHADO MERECE SUA ATENÇÃO!'],
} as const;
export type DropouCategory=keyof typeof dropouCalls;
const normal=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function dropouCategory(name:string):DropouCategory{
 const n=normal(name);
 if(/controle|joystick|gamepad|volante|suporte.*console|acessorio.*console/.test(n))return 'controls';
 if(/teclado|mouse|headset|fone|microfone|webcam|periferico/.test(n))return 'peripherals';
 if(/ssd|nvme|memoria|processador|ryzen|placa|geforce|radeon|gabinete|fonte|cooler|monitor|notebook|desktop|mini pc/.test(n))return 'hardware';
 if(/\bjogo\b|\bgame\b/.test(n))return 'games';
 if(/console|playstation|\bps[345]\b|xbox|nintendo|videogame|video game/.test(n))return 'consoles';
 return 'tech';
}
export const cleanCaptionName=(s:string)=>s.replace(/https?:\/\/\S+|www\.\S+|R\$\s*[\d.,]+/gi,'').replace(/[\r\n*_~<>\[\]]/g,' ').replace(/\s+/g,' ').trim();
export function dropouProductSummary(p:Pick<Product,'name'|'shortName'|'features'|'featuresVerified'>){
 // Keep literal product facts, including specifications that occur after a long title.
 const name=cleanCaptionName(p.name),base=cleanCaptionName(p.shortName||name),category=dropouCategory(name);
 const patterns:RegExp[]=category==='games'||category==='consoles'?[/\b(?:PS[345]|PlayStation\s*[345]|Xbox(?:\s+(?:One|Series\s*[SX]))?|Nintendo\s*Switch|PC)\b/gi]:category==='controls'?[/\b(?:PS[345]|Xbox(?:\s+(?:One|Series\s*[SX]))?|Nintendo\s*Switch|PC|Android|iOS|Bluetooth|USB(?:-C)?)\b/gi]:category==='peripherals'?[/\b(?:switch\s+[\w-]+|Bluetooth(?:\s*\d(?:\.\d)?)?|USB(?:-C)?|wireless|sem fio|\d+(?:[.,]\d+)?\s*(?:GHz|DPI))\b/gi]:category==='hardware'?[/\b\d+(?:[.,]\d+)?\s*(?:TB|GB|Hz|polegadas)\b/gi,/\b\d{2}(?:[.,]\d)?["″]/g,/\b(?:NVMe|SATA|PCIe(?:\s*[345](?:\.0)?)?|Full\s*HD|QHD|UHD|[248]K|RTX\s*\d{4}(?:\s*Ti)?|RX\s*\d{4}(?:\s*XT)?)\b/gi]:[/\b\d+\s*(?:TB|GB)\b/gi];
 const facts=[...new Set(patterns.flatMap(re=>[...name.matchAll(re)].map(m=>m[0])))];
 if(p.featuresVerified)facts.push(...(p.features||[]).map(cleanCaptionName));
 const shortened=base.length>100?base.slice(0,97).replace(/\s+\S*$/,'')+'…':base;
 const extra=facts.filter(f=>f&&!normal(shortened).includes(normal(f))).slice(0,3);
 return [shortened,...extra].join(' · ').slice(0,170);
}
const brl=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
export function dropouCaption(p:Pick<Product,'name'|'shortName'|'features'|'featuresVerified'|'price'|'previousVerified'|'previousPrice'|'paymentMethod'|'affiliateUrl'>,headline:string=dropouCalls[dropouCategory(p.name)][0]){
 const old=p.previousVerified&&p.previousPrice&&p.previousPrice>p.price?p.previousPrice:null;
 const price=brl(p.price)+(p.paymentMethod==='pix'?' no Pix':'');
 return [headline,'🎮 *'+dropouProductSummary(p)+'*',old?'~'+brl(old)+'~\n🔥 *AGORA POR '+price+'!*':'💰 *POR APENAS '+price+'!*','🛒 Garanta o seu aqui:\n🔗 '+p.affiliateUrl,'#publi | Dropou 🎮'].join('\n\n');
}
export function replaceDropouOpening(caption:string,headline:string){
 if(!Object.values(dropouCalls).some(calls=>(calls as readonly string[]).includes(headline)))throw new Error('Chamada local inválida.');
 const end=caption.indexOf('\n\n');
 if(end<0)throw new Error('Mantenha a abertura separada do restante da legenda por uma linha em branco.');
 return headline+caption.slice(end);
}
