export function authUnavailable(error:{name?:string;status?:number}){
 return error.name==='AuthRetryableFetchError'||error.status===0||(error.status!==undefined&&error.status>=500);
}
