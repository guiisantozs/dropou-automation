import type {ImportCheck,OfficialResponse} from './import-core';
// Retain only product fields needed by the importer, never private account data.
function publicData(value:any,resource:ImportCheck['resource']){
 if(!value||typeof value!=='object')return null;
 if(resource==='catalog'&&Array.isArray(value.results))return {results:value.results.slice(0,5).map((r:any)=>publicData(r,'catalog'))};
 if(resource==='price')return {amount:value.amount,regular_amount:value.regular_amount,currency_id:value.currency_id};
 return {id:value.id,title:value.title,name:value.name,status:value.status,available_quantity:value.available_quantity,price:value.price,currency_id:value.currency_id,catalog_product_id:value.catalog_product_id,secure_thumbnail:value.secure_thumbnail,pictures:Array.isArray(value.pictures)?value.pictures.slice(0,12).map((p:any)=>({id:p.id,secure_url:p.secure_url,url:p.url})):[],attributes:Array.isArray(value.attributes)?value.attributes.filter((a:any)=>['BRAND','MODEL'].includes(a.id)).map((a:any)=>({id:a.id,value_name:a.value_name})):[],variations:Array.isArray(value.variations)?value.variations.slice(0,100).map((v:any)=>({id:v.id,price:v.price,picture_ids:Array.isArray(v.picture_ids)?v.picture_ids.filter((p:unknown)=>typeof p==='string').slice(0,12):[],attribute_combinations:Array.isArray(v.attribute_combinations)?v.attribute_combinations.slice(0,8).map((a:any)=>({value_name:typeof a.value_name==='string'?a.value_name.slice(0,50):''})):[]})):[]};
}
export function mercadoLivreImportPath(path:string){return /^\/(items\/MLB\d{5,20}(\/sale_price\?context=channel_marketplace)?|products\/MLB\d{5,20}|products\/search\?status=active&site_id=MLB&q=[A-Za-z0-9%+_.~-]{1,1620}&limit=5)$/.test(path);}
export async function requestMercadoLivreImport(path:string,resource:ImportCheck['resource'],token:string,http:typeof fetch=fetch):Promise<OfficialResponse&{seconds:number}>{
 if(!mercadoLivreImportPath(path))throw new Error('Recurso Mercado Livre inválido.');
 try{
  const r=await http('https://api.mercadolibre.com'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  const raw=await r.json().catch(()=>null),valid=resource==='price'?typeof raw?.amount==='number'&&raw.amount>0&&raw.currency_id==='BRL':path.startsWith('/products/search?')?Array.isArray(raw?.results):raw?.id===path.split('/').pop(),state:ImportCheck['state']=r.ok&&valid?'available':r.status===401?'unauthorized':r.status===403?'denied':r.status===429?'rate_limit':'unavailable';
  const check:ImportCheck={resource,state,httpStatus:r.status,...(r.ok&&!valid?{code:'invalid_response'}:{})};
  // Codes/IDs have a strict alphabet; response messages may contain credentials and are not retained.
  if(!r.ok&&typeof raw?.error==='string'&&/^[a-z_]{2,70}$/.test(raw.error))check.code=raw.error;
  const rid=r.headers.get('x-request-id');if(rid&&/^[a-f0-9-]{16,80}$/i.test(rid))check.requestId=rid;
  let seconds=state==='available'?900:state==='denied'?3600:state==='unauthorized'?900:30;
  if(state==='rate_limit'){const retry=r.headers.get('retry-after')||'';const delta=/^\d+$/.test(retry)?Number(retry):Math.ceil((Date.parse(retry)-Date.now())/1000);seconds=Number.isFinite(delta)?Math.max(60,Math.min(3600,delta)):60;}
  if(state!=='available')check.retryAt=new Date(Date.now()+seconds*1000).toISOString();
  return {data:state==='available'?publicData(raw,resource):null,check,seconds};
 }catch{return {data:null,check:{resource,state:'unavailable',code:'network_error'},seconds:30};}
}
