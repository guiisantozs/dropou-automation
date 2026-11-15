import {type OperationScope} from './workspace-brands';
import type {api} from './api';
/** Bind a page request before any async work. Explicit destination choices survive. */
export function operationPath(path:string,operation:OperationScope){
 const url=new URL(path,'https://dropou.local');
 if(!url.searchParams.has('brand'))url.searchParams.set('brand',operation);
 return url.pathname+url.search+url.hash;
}
export function bindOperationRequest(request:typeof api,operation:OperationScope):typeof api{return <T>(path:string,method='GET',body?:unknown)=>request<T>(operationPath(path,operation),method,body);}
