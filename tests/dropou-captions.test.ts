import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dropouCaption,dropouCalls,dropouCategory,dropouProductSummary,replaceDropouOpening} from '../src/lib/dropou-captions';
import {emptyProduct} from '../src/lib/product-draft';
import {captionError} from '../src/lib/caption-editor';
import {formatCaption} from '../src/lib/ai';
import {nextPublicationSlots} from '../src/lib/publication';
test('local gamer categories keep literal specifications and do not invent missing facts',()=>{
 const cases=[['Jogo Spider-Man PS5','games'],['Controle GameSir Bluetooth PC Android','controls'],['Teclado mecânico switch red USB-C','peripherals'],['SSD Kingston 1TB NVMe PCIe 4.0','hardware'],['Monitor AOC 27 polegadas QHD 144Hz','hardware'],['Placa de vídeo ASUS RTX 4060 Ti 8GB','hardware'],['Celular Samsung Galaxy A55 256GB','tech']] as const;
 for(const [name,category]of cases){const p={...emptyProduct(),name};assert.equal(dropouCategory(name),category);const summary=dropouProductSummary(p);for(const spec of name.match(/PS5|Bluetooth|switch red|1TB|NVMe|144Hz|RTX 4060 Ti|256GB/g)||[])assert.ok(summary.includes(spec),spec);}
 const summary=dropouProductSummary({...emptyProduct(),name:'Mouse sem especificações',features:['12000 DPI'],featuresVerified:false});assert.doesNotMatch(summary,/12000|Bluetooth|USB/);
 assert.ok(dropouProductSummary({...emptyProduct(),name:'SSD '+('armazenamento '.repeat(10))+'2TB NVMe'}).includes('2TB'));
});
test('gamer captions highlight only registered prices, preserve tracking and replace only the opening',()=>{
 const p={...emptyProduct(),name:'Controle Bluetooth PC',price:149.9,affiliateUrl:'https://meli.la/test?tracking=abc%2Fz'};
 const text=dropouCaption(p);assert.match(text,/POR APENAS R\$\s*149,90/);assert.match(text,/#publi \| Dropou 🎮$/);assert.equal(captionError(text,p),null);assert.doesNotMatch(text,/Link de afiliado|condições podem|disponibilidade atualizados|199,90/);
 const edited=text.replace('🎮 *','🎮 Minha edição *'),changed=replaceDropouOpening(edited,dropouCalls.controls[1]);assert.equal(changed.slice(changed.indexOf('\n\n')),edited.slice(edited.indexOf('\n\n')));assert.ok(changed.includes(p.affiliateUrl));
 assert.throws(()=>replaceDropouOpening(text,'FRETE GRÁTIS'),/inválida/);
 assert.match(dropouCaption({...p,previousVerified:true,previousPrice:199.9}),/~R\$\s*199,90~\n🔥 \*AGORA POR/);
 assert.doesNotMatch(dropouCaption({...p,previousVerified:false,previousPrice:199.9}),/199,90/);
 for(const brand of ['bruto','moda','barato','linda'] as const){const copy=formatCaption(p,brand);assert.ok(!copy.includes('#publi | Dropou'));assert.match(copy,/CONFIRA A OFERTA/);}
});
test('quick slots use the configured Bahia routine, skip elapsed times and roll across midnight',()=>{
 assert.deepEqual(nextPublicationSlots(['09:00','12:30','09:00','bad'],Date.parse('2026-11-12T12:00:00-03:00')).map(s=>s.value),['2026-11-12T12:30','2026-11-13T09:00','2026-11-13T12:30']);
 assert.equal(nextPublicationSlots(['08:00'],Date.parse('2026-11-12T23:58:00-03:00'))[0].value,'2026-11-13T08:00');assert.deepEqual(nextPublicationSlots([],Date.now()),[]);
});
