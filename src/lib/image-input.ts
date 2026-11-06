export const imageTypes=['image/png','image/jpeg','image/webp'];
export const MAX_IMAGES=3;
export function validateImageFiles(files:File[]){
 if(files.some(f=>!imageTypes.includes(f.type)||f.size>8e6||f.size===0))throw new Error('Use PNG, JPEG ou WebP de até 8 MB por imagem.');
 return files;
}
export function pastedImages(data:Pick<DataTransfer,'items'|'files'>|null):File[]{
 if(!data)return [];
 const fromItems=Array.from(data.items||[]).filter(i=>i.kind==='file'&&imageTypes.includes(i.type)).map(i=>i.getAsFile()).filter((f):f is File=>!!f);
 return fromItems.length?fromItems:Array.from(data.files||[]).filter(f=>imageTypes.includes(f.type));
}
export async function clipboardImages(clipboard:Pick<Clipboard,'read'>|undefined,secure:boolean){
 if(!secure||!clipboard?.read)throw new Error('Use Ctrl + V na área do print ou selecione imagens da galeria.');
 let items:ClipboardItems;try{items=await clipboard.read();}catch{throw new Error('O navegador não liberou a colagem. Clique na área do print e pressione Ctrl + V, ou selecione imagens.');}
 const files:File[]=[];for(const item of items){const type=imageTypes.find(t=>item.types.includes(t));if(type)files.push(new File([await item.getType(type)],'print.'+type.split('/')[1],{type}));}
 if(!files.length)throw new Error('Nenhuma imagem encontrada. Tire um print e use Ctrl + V, ou selecione uma imagem da galeria.');return validateImageFiles(files);
}
export function optimizedSize(width:number,height:number){
 if(width<=0||height<=0||width*height>50e6)throw new Error('Imagem inválida ou grande demais. Recorte o anúncio antes de anexar.');
 const scale=Math.min(1,1600/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function canvasBlob(canvas:HTMLCanvasElement,quality=0.9):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível preparar a imagem.')),'image/jpeg',quality));}
