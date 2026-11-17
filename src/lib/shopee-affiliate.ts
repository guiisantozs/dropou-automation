// URL shape alone never proves account ownership. The server also compares the
// exact link with a response cached from the centrally authenticated Shopee API.
export function validShopeeAffiliateLink(raw:string){
 try{
  if(raw.length>2048||/[\s<>\\]/.test(raw))return false;
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['shopee.com.br','s.shopee.com.br','shope.ee'].includes(u.hostname))return false;
  if(u.pathname==='/an_redir'){
   const origin=new URL(u.searchParams.get('origin_link')||'');
   return /^[0-9]+$/.test(u.searchParams.get('affiliate_id')||'')&&origin.protocol==='https:'&&['shopee.com.br','www.shopee.com.br'].includes(origin.hostname)&&!origin.username&&!origin.password&&!origin.port&&/\/(?:product|opaanlp)\/\d+\/\d+|-i\.\d+\.\d+/.test(origin.pathname);
  }
  if(['s.shopee.com.br','shope.ee'].includes(u.hostname))return /^\/[A-Za-z0-9_-]{2,100}\/?$/.test(u.pathname)&&!['product','search','shop'].includes(u.pathname.replace(/\//g,''));
  return /^[0-9]+$/.test(u.searchParams.get('affiliate_id')||'')&&/\/(?:product|opaanlp)\/\d+\/\d+|-i\.\d+\.\d+/.test(u.pathname);
 }catch{return false;}
}
