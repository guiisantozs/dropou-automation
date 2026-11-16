import {timingSafeEqual} from 'node:crypto';
import {seal,unseal} from '../mercado-livre/oauth-core';

export class MtprotoFailure extends Error {
 constructor(public code:string,public retryAfter=0){super(code);}
}
export function encryptionKey(value:string|undefined){
 const key=Buffer.from(value||'','base64');
 if(key.length!==32||key.toString('base64')!==value)throw new MtprotoFailure('vault');
 return key;
}
export function encryptState(value:unknown,key:Buffer,scope:string){return seal(JSON.stringify(value),key,'mtproto:v1:'+scope);}
export function decryptState<T>(value:string,key:Buffer,scope:string):T{
 try{return JSON.parse(unseal(value,key,'mtproto:v1:'+scope)) as T;}catch{throw new MtprotoFailure('vault');}
}
export function authorizedWorker(header:string|undefined,secret:string){
 if(secret.length<32||!header?.startsWith('Bearer '))return false;
 const actual=Buffer.from(header.slice(7)),expected=Buffer.from(secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function workerOrigin(value:string|undefined){
 try{const u=new URL(value||'');if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw new Error();return u.origin;}catch{throw new MtprotoFailure('unavailable');}
}
export function providerFailure(error:unknown):MtprotoFailure{
 if(error instanceof MtprotoFailure)return error;
 const e=error as {errorMessage?:string;seconds?:number};
 const code=e?.errorMessage||'';
 if(/^FLOOD_(?:PREMIUM_)?WAIT/.test(code))return new MtprotoFailure('flood',Math.max(60,Math.min(e.seconds||300,86400)));
 if(/PHONE_CODE_(INVALID|EMPTY)/.test(code))return new MtprotoFailure('code');
 if(/PHONE_CODE_EXPIRED/.test(code))return new MtprotoFailure('expired');
 if(/PASSWORD_HASH_INVALID/.test(code))return new MtprotoFailure('password');
 if(/AUTH_KEY|SESSION_(REVOKED|EXPIRED)|USER_DEACTIVATED/.test(code))return new MtprotoFailure('revoked');
 return new MtprotoFailure('provider');
}
