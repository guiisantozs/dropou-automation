import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectScreenshotPhoto,type TextRegion} from '../src/lib/screenshot-photo';
import {parseMercadoLivreScreenshot} from '../src/lib/mercado-livre-screenshot';
import {ocrVisualResult,visualDraft} from '../src/lib/visual';
import {emptyProduct} from '../src/lib/product-draft';
function fixture(w=640,h=400){
 const pixels=new Uint8ClampedArray(w*h*4).fill(255);
 const rect=(x:number,y:number,width:number,height:number,color=70)=>{for(let j=Math.round(y*h);j<Math.round((y+height)*h);j++)for(let i=Math.round(x*w);i<Math.round((x+width)*w);i++){const p=(j*w+i)*4;pixels[p]=pixels[p+1]=pixels[p+2]=color;}};
 const words:TextRegion[]=[{x:.66,y:.15,w:.25,h:.06,text:'Smartphone',confidence:95},{x:.66,y:.35,w:.2,h:.06,text:'R$ 1.899,90',confidence:95}];
 words.forEach(b=>rect(b.x,b.y,b.w,b.h));
 return {pixels,rect,words,detect:()=>detectScreenshotPhoto(w,h,pixels,words)};
}
for(const [w,h] of [[640,400],[400,640],[320,320]])test(`photo segmentation keeps the complete main product, excludes interface and small thumbnails at ${w}x${h}`,()=>{
 const f=fixture(w,h);f.rect(.18,.22,.33,.55);f.rect(.03,.25,.06,.09);f.rect(.03,.4,.06,.09);
 const result=f.detect();assert.equal(result.confidence,'high');const c=result.crop!;
 assert.ok(c.x<18&&c.x>9);assert.ok(c.y<22);assert.ok(c.x+c.w>51&&c.x+c.w<65);assert.ok(c.y+c.h>77&&c.y+c.h<90);
});
test('white products with a visible contour keep white interiors and require no background removal',()=>{
 const f=fixture();f.rect(.18,.22,.33,.55,205);f.rect(.19,.23,.31,.53,253);const original=f.pixels.slice();
 assert.equal(f.detect().confidence,'high');assert.deepEqual(f.pixels,original);
});
test('ambiguous, clipped, low-resolution and text-contaminated captures require manual selection',()=>{
 const ambiguous=fixture();ambiguous.rect(.1,.2,.3,.5);ambiguous.rect(.5,.2,.3,.5);assert.equal(ambiguous.detect().crop,undefined);
 const clipped=fixture();clipped.rect(0,.2,.4,.6);assert.equal(clipped.detect().crop,undefined);
 const f=fixture();f.rect(.2,.2,.3,.6);assert.equal(detectScreenshotPhoto(640,400,f.pixels).crop,undefined);
 f.words.push({x:.3,y:.4,w:.1,h:.03,text:'Comprar',confidence:90});assert.equal(f.detect().crop,undefined);
 assert.equal(detectScreenshotPhoto(10,10,new Uint8ClampedArray(400)).crop,undefined);
});
test('large color alternatives require an explicit photo choice instead of combining different variants',()=>{
 const f=fixture();f.rect(.1,.25,.2,.5);f.rect(.34,.25,.2,.5);assert.equal(f.detect().crop,undefined);
 // Adjacent alternatives are ambiguous even without recognized interface labels.
 f.words.push({x:.30,y:.5,w:.1,h:.03,text:'Selecionar cor',confidence:90});assert.equal(f.detect().crop,undefined);

});
test('full-capture OCR extracts only visible metadata before related products and keeps unknown facts empty',()=>{
 const fields=parseMercadoLivreScreenshot('Novo | +100 vendidos\nSmartphone Samsung Galaxy A55\nPor R$ 1.899,90\nMarca: Samsung\nModelo: A55\nCor: Azul\nArmazenamento: 256 GB\nProdutos relacionados\nCondição: Usado\nMarca: Outra',95);
 assert.equal(fields.name,'Smartphone Samsung Galaxy A55');assert.equal(fields.price,1899.9);assert.equal(fields.condition,'novo');assert.equal(fields.brand,'Samsung');assert.equal(fields.model,'A55');assert.match(fields.selectedVariant!,/Azul.*256 GB/);
 const extraction=ocrVisualResult(fields).extraction!;const draft=visualDraft(emptyProduct(),extraction,'dropou');assert.equal(draft.visualDetails?.condition,'novo');assert.equal(draft.visualDetails?.selectedVariant,fields.selectedVariant);
 const unknown=parseMercadoLivreScreenshot('Fone branco Bluetooth\nR$ 199,90',95);assert.equal(unknown.condition,undefined);assert.equal(unknown.brand,undefined);assert.equal(unknown.model,undefined);assert.equal(unknown.selectedVariant,undefined);
 assert.equal(parseMercadoLivreScreenshot('Condição: Recondicionado\nMonitor gamer\nR$ 999,00',95).condition,'recondicionado');
});
