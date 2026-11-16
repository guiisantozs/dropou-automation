import {mtprotoCommand} from '../../lib/telegram-mtproto';
import {MtprotoFailure} from './security';

export async function readMtprotoCommand(request:Request){
 if(Number(request.headers.get('content-length'))>4096)throw new MtprotoFailure('input');
 const reader=request.body?.getReader();if(!reader)throw new MtprotoFailure('input');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new MtprotoFailure('input');}chunks.push(value);}
  const parsed=mtprotoCommand.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
  if(!parsed.success)throw new MtprotoFailure('input');return parsed.data;
 }catch{throw new MtprotoFailure('input');}finally{reader.releaseLock();}
}
