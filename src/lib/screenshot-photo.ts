import type {Crop} from './image-preparation';
export type TextRegion={x:number;y:number;w:number;h:number;text:string;confidence:number};
type Box={x:number;y:number;w:number;h:number;pixels:number};
export type PhotoDetection={crop?:Crop;confidence:'high'|'uncertain';reason:string};
const intersects=(a:Box,b:Box)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
const union=(a:Box,b:Box):Box=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y),pixels:a.pixels+b.pixels});
const area=(b:Box)=>b.w*b.h;
const uncertain=(reason:string):PhotoDetection=>({confidence:'uncertain',reason});

/** Conservative segmentation of screenshot pixels, never image generation or background removal. */
export function detectScreenshotPhoto(width:number,height:number,rgba:Uint8ClampedArray,words:TextRegion[]=[]):PhotoDetection{
 if(width<100||height<100||width*height>1500000||rgba.length!==width*height*4)return uncertain('A captura não tem resolução adequada para um recorte seguro.');
 const mask=new Uint8Array(width*height),original=new Uint8Array(width*height),total=width*height;
 for(let i=0;i<total;i++){const p=i*4;original[i]=mask[i]=rgba[p+3]>100&&Math.min(rgba[p],rgba[p+1],rgba[p+2])<229?1:0;}
 // OCR runs on the full capture. Its word boxes suppress interface text for segmentation only.
 const text=words.filter(w=>w.confidence>=30&&w.w>0&&w.h>0).map(w=>({...w,x:Math.max(0,w.x*width),y:Math.max(0,w.y*height),w:w.w*width,h:w.h*height,pixels:0}));
 for(const box of text)for(let y=Math.max(0,Math.floor(box.y)-1);y<Math.min(height,Math.ceil(box.y+box.h)+1);y++)for(let x=Math.max(0,Math.floor(box.x)-1);x<Math.min(width,Math.ceil(box.x+box.w)+1);x++)mask[y*width+x]=0;
 const queue=new Int32Array(total),components:Box[]=[];
 for(let start=0;start<total;start++){
  if(!mask[start])continue;let head=0,tail=1,minX=start%width,maxX=minX,minY=Math.floor(start/width),maxY=minY;queue[0]=start;mask[start]=0;
  while(head<tail){const index=queue[head++],x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const next=ny*width+nx;if(mask[next]){mask[next]=0;queue[tail++]=next;}}
  }
  const box={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,pixels:tail};
  if(box.w>=width*.045&&box.h>=height*.045&&area(box)>=total*.004&&tail>=total*.0008)components.push(box);
 }
 // A full-screen panel, header, or border is not a photograph.
 const candidates=components.filter(b=>b.w<width*.88&&b.h<height*.88&&area(b)<total*.65&&b.w/b.h>.12&&b.w/b.h<7);
 const major=candidates.filter(b=>area(b)>total*.025).sort((a,b)=>area(b)-area(a));
 if(major[1]&&area(major[1])>area(major[0])*.5)return uncertain('Há mais de uma fotografia ou partes separadas de tamanho semelhante. Escolha a região principal.');
 const groups:Box[]=[];const used=new Set<Box>();
 for(const seed of candidates){if(used.has(seed))continue;let group=seed;used.add(seed);let changed=true;
  while(changed){changed=false;for(const next of candidates){if(used.has(next))continue;const gapX=Math.max(0,Math.max(group.x,next.x)-Math.min(group.x+group.w,next.x+next.w)),gapY=Math.max(0,Math.max(group.y,next.y)-Math.min(group.y+group.h,next.y+next.h));
   const alignY=Math.max(0,Math.min(group.y+group.h,next.y+next.h)-Math.max(group.y,next.y))/Math.min(group.h,next.h);
   if(gapX<width*.045&&gapY===0&&alignY>.65&&Math.min(group.h,next.h)/Math.max(group.h,next.h)>.45){group=union(group,next);used.add(next);changed=true;}
  }}groups.push(group);
 }
 const ranked=groups.filter(b=>area(b)>total*.025&&b.w>=width*.11&&b.h>=height*.11&&b.pixels/area(b)>.045).sort((a,b)=>area(b)-area(a));
 const main=ranked[0];if(!main)return uncertain('Não identifiquei uma fotografia principal separada dos textos. Ajuste o recorte.');
 if(ranked[1]&&area(ranked[1])>area(main)*.5)return uncertain('Há mais de uma imagem de tamanho semelhante. Escolha a fotografia principal.');
 const pad=Math.max(4,Math.round(Math.min(main.w,main.h)*.06)),crop={x:Math.max(0,main.x-pad),y:Math.max(0,main.y-pad),w:Math.min(width,main.x+main.w+pad)-Math.max(0,main.x-pad),h:Math.min(height,main.y+main.h+pad)-Math.max(0,main.y-pad),pixels:0};
 if(main.x<3||main.y<3||main.x+main.w>width-3||main.y+main.h>height-3)return uncertain('O produto pode estar cortado na borda da captura. Ajuste a região antes de usar.');
 const within=text.filter(t=>intersects(crop,t)>0);
 if(within.some(t=>/R\s*\$|comprar|carrinho|vendidos|avalia|frete|parcel|selecion|mercado livre|mais vendido/i.test(t.text))||within.reduce((n,t)=>n+intersects(crop,t),0)>area(crop)*.025)return uncertain('A região pode conter textos ou controles do anúncio. Ajuste o recorte.');
 // Require a mostly clear outer ring. Nearby thumbnails and disconnected product parts cause review.
 let ring=0,occupied=0;for(let y=crop.y;y<crop.y+crop.h;y++)for(let x=crop.x;x<crop.x+crop.w;x++){if(x<main.x||x>=main.x+main.w||y<main.y||y>=main.y+main.h){ring++;occupied+=original[y*width+x];}}
 if(ring&&occupied/ring>.1)return uncertain('Há elementos muito próximos do produto. Ajuste a região para não incluir miniaturas.');
 // Without OCR evidence, interfaces with large blocks cannot be distinguished safely.
 if(text.length<2)return uncertain('Aguardando a leitura da captura para separar a fotografia dos textos. Você também pode ajustar manualmente.');
 return {confidence:'high',reason:'Fotografia localizada na captura. Confira o enquadramento antes de salvar.',crop:{x:crop.x/width*100,y:crop.y/height*100,w:crop.w/width*100,h:crop.h/height*100}};
}
export function ocrTextRegions(page:{blocks?:import('tesseract.js').Block[]|null},width:number,height:number):TextRegion[]{
 return (page.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).map(w=>({text:w.text,confidence:w.confidence,x:w.bbox.x0/width,y:w.bbox.y0/height,w:(w.bbox.x1-w.bbox.x0)/width,h:(w.bbox.y1-w.bbox.y0)/height}));
}
