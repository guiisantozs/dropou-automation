export async function shareWhatsApp(text:string,nav:Pick<Navigator,'share'>=navigator,open:(url:string)=>unknown=url=>window.open(url,'_blank','noopener,noreferrer')){
 if(nav.share){try{await nav.share({text});return 'Compartilhamento aberto. Escolha o WhatsApp e o destino; confirme a publicação manualmente.';}catch(e){if((e as Error).name==='AbortError')return 'Compartilhamento cancelado.';}}
 const opened=open('https://wa.me/?text='+encodeURIComponent(text));if(opened===null)throw new Error('Permita abrir o WhatsApp no navegador ou copie a legenda.');return 'WhatsApp aberto. Escolha o destino e envie manualmente.';
}
export async function copyImage(blob:Blob,clipboard:Pick<Clipboard,'write'>=navigator.clipboard){
 if(!clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('Copiar imagem não é compatível neste navegador. Use Baixar imagem ou Compartilhar imagem.');
 let png=blob;
 if(blob.type!=='image/png'){
  const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');if(!context)throw new Error('Falha ao converter imagem.');context.drawImage(image,0,0);png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao converter imagem.')),'image/png'));canvas.width=canvas.height=0;image.src='';}finally{URL.revokeObjectURL(url);}
 }
 try{await clipboard.write([new ClipboardItem({'image/png':png})]);}catch{throw new Error('O navegador recusou a cópia. Use Baixar imagem ou Compartilhar imagem.');}
}
export function downloadImage(blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dropou-produto.'+(blob.type==='image/png'?'png':'jpg');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
