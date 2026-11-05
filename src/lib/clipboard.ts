export async function copyText(text:string,clipboard:Pick<Clipboard,'writeText'>=navigator.clipboard){
 if(!clipboard?.writeText)throw new Error('O navegador não permite copiar. Selecione o texto da legenda e copie manualmente.');
 try{await clipboard.writeText(text);}catch{throw new Error('Não foi possível copiar. Permita o acesso à área de transferência ou copie o texto manualmente.');}
}
