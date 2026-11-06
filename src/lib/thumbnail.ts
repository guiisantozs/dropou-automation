// WebP container dimensions; reject animated files and keep thumbnails exactly 256 square.
export function webpDimensions(bytes:Uint8Array){
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 if(bytes.length<30||ascii(0,4)!=='RIFF'||ascii(8,12)!=='WEBP')throw new Error('Miniatura WebP inválida.');
 const type=ascii(12,16),le24=(i:number)=>bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16;
 if(type==='VP8X'){if(bytes[20]&2)throw new Error('Miniaturas animadas não são aceitas.');return {width:le24(24)+1,height:le24(27)+1};}
 if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return {width:(bytes[26]|bytes[27]<<8)&16383,height:(bytes[28]|bytes[29]<<8)&16383};
 if(type==='VP8L'&&bytes[20]===47)return {width:1+(bytes[21]|(bytes[22]&63)<<8),height:1+((bytes[22]>>6)|bytes[23]<<2|(bytes[24]&15)<<10)};
 throw new Error('Miniatura WebP não reconhecida.');
}
