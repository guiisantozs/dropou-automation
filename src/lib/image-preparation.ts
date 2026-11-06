import {optimizedSize,canvasBlob} from './image-input';
export type Crop={x:number;y:number;w:number;h:number};
export type Shot={id:string;file:File;url:string;crop:Crop};
/** Instance-owned cache: canvases and compressed blobs, never a global base64 cache. */
export class ImagePreparation{
 private entries=new Map<string,{shot:Shot;canvas:Promise<HTMLCanvasElement>;blob?:Promise<Blob>}>();
 private images=new Set<HTMLImageElement>();private disposed=false;
 async canvas(shot:Shot){
  if(this.disposed)throw new Error('Processamento cancelado.');
  const existing=this.entries.get(shot.id);if(existing?.shot===shot)return existing.canvas;
  if(existing)this.remove(shot.id);
  const promise=(async()=>{
   const img=new Image();this.images.add(img);img.src=shot.url;
   try{await img.decode();if(this.disposed)throw new Error('Processamento cancelado.');
    const {x,y,w,h}=shot.crop,sx=img.naturalWidth*x/100,sy=img.naturalHeight*y/100,sw=Math.max(1,img.naturalWidth*Math.min(w,100-x)/100),sh=Math.max(1,img.naturalHeight*Math.min(h,100-y)/100);
    const size=optimizedSize(sw,sh),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Seu navegador não conseguiu preparar a imagem.');context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);context.drawImage(img,sx,sy,sw,sh,0,0,size.width,size.height);return canvas;
   }finally{img.src='';this.images.delete(img);}
  })();
  this.entries.set(shot.id,{shot,canvas:promise});return promise;
 }
 async optimized(shot:Shot){
  const canvas=await this.canvas(shot),entry=this.entries.get(shot.id)!;
  entry.blob??=(async()=>{let blob=await canvasBlob(canvas);for(const quality of [.8,.68]){if(blob.size<=750000)break;blob=await canvasBlob(canvas,quality);}if(blob.size>750000)throw new Error('Recorte a região do anúncio para manter o print legível e leve.');return blob;})();
  const blob=await entry.blob;
  if(this.disposed)throw new Error('Processamento cancelado.');
  const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Falha ao ler a imagem.'));reader.readAsDataURL(blob);});
  return {dataUrl,width:canvas.width,height:canvas.height};
 }
 remove(id:string){const entry=this.entries.get(id);this.entries.delete(id);entry?.canvas.then(c=>{c.width=c.height=0;}).catch(()=>{});}
 clear(){this.disposed=true;this.images.forEach(img=>{img.src='';});this.images.clear();for(const id of this.entries.keys())this.remove(id);}
}
export class WorkerLifetime{
 private closed=false;private worker?:{terminate:()=>Promise<unknown>};
 async attach<T extends {terminate:()=>Promise<unknown>}>(worker:T){if(this.closed){await worker.terminate();throw new Error('OCR cancelado.');}this.worker=worker;return worker;}
 async stop(){this.closed=true;const worker=this.worker;this.worker=undefined;await worker?.terminate();}
 async finish(){const worker=this.worker;this.worker=undefined;await worker?.terminate();}
 get cancelled(){return this.closed;}
}
