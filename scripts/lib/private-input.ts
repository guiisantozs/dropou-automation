/** Local administrative input: no terminal echo, arguments, files or application logs. */
export function privateInput(){
 return new Promise<string>((resolve,reject)=>{
  let value='';const input=process.stdin,wasRaw=input.isTTY&&input.isRaw;
  if(input.isTTY)input.setRawMode(true);input.setEncoding('utf8');input.resume();
  function finish(){input.off('data',data);input.off('end',end);if(input.isTTY)input.setRawMode(!!wasRaw);input.pause();}
  function end(){value='';finish();reject(Error('Entrada incompleta.'));}
  function data(chunk:string){
   if(chunk.includes('\u0003')||value.length+chunk.length>4096){value='';finish();reject(Error('Entrada inválida.'));return;}
   value+=chunk;
   if(/[\r\n]/.test(value)){const result=value.replace(/[\r\n]+$/,'');value='';finish();resolve(result);}
  }
  input.on('data',data);input.once('end',end);
 });
}
