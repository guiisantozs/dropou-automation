export function shopeeLimit(env:Record<string,string|undefined>,purpose:'manual'|'search'|'mirror'){
 const key=purpose==='manual'?'SHOPEE_MANUAL_DAILY_REQUEST_LIMIT':purpose==='mirror'?'SHOPEE_MIRROR_DAILY_REQUEST_LIMIT':'SHOPEE_DISCOVERY_DAILY_REQUEST_LIMIT';
 const fallback=purpose==='manual'?200:purpose==='mirror'?10:40,n=Number(env[key]||fallback);
 return Number.isInteger(n)&&n>=1&&n<=1000?n:fallback;
}
