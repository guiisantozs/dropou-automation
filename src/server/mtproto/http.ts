import {createServer} from 'node:http';
import {z} from 'zod';
import {mtprotoCommand,type MtprotoCommand} from '../../lib/telegram-mtproto';
import {authorizedWorker,providerFailure} from './security';
import type {Scope} from './store';

const requestSchema=z.object({scope:z.object({owner:z.uuid(),brand:z.enum(['dropou','bruto','moda','celulares','tenis','automoto'])}).strict(),command:mtprotoCommand}).strict();
export function mtprotoHttpServer(options:{secret:string;ready:()=>boolean;diagnostic?:boolean;command:(scope:Scope,command:MtprotoCommand)=>Promise<unknown>}){
 const server=createServer(async(req,res)=>{
  const respond=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(!authorizedWorker(req.headers.authorization,options.secret))return respond(401,{code:'unauthorized'});
  if(req.method==='GET'&&req.url==='/health'){
   if(options.diagnostic)return respond(200,{ready:false,mode:'diagnostic',transportReady:true,accountLoginEnabled:false,databaseReady:false});
   return respond(options.ready()?200:503,{ready:options.ready()});
  }
  if(req.method!=='POST'||req.url!=='/command')return respond(404,{code:'not_found'});
  // An explicit local diagnostic process never parses credentials, creates clients or accesses a DB.
  if(options.diagnostic)return respond(503,{code:'diagnostic_only'});
  if(!options.ready())return respond(503,{code:'unavailable'});
  try{
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>4096)return respond(413,{code:'invalid'});chunks.push(b);}
   const parsed=requestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success)return respond(400,{code:'invalid'});
   respond(200,await options.command(parsed.data.scope,parsed.data.command));
  }catch(error){const e=providerFailure(error);respond(e.code==='flood'?429:503,{code:e.code,retryAfter:e.retryAfter});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.maxConnections=32;
 return server;
}
