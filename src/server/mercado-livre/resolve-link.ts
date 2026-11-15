import {mercadoLivreIdentity,mercadoLivreUrl} from '../../lib/mercado-livre-link';
export async function resolveMercadoLivreLink(input:string,http:typeof fetch=fetch){
 let current=mercadoLivreUrl(input).href;const visited=new Set<string>();
 for(let hop=0;hop<=4;hop++){
  const identity=mercadoLivreIdentity(current);
  if(!identity.short&&(identity.itemId||identity.catalogId))return {...identity,inputUrl:input};
  if(!identity.short)return {...identity,inputUrl:input};
  if(visited.has(current)||hop===4)throw new Error('O link curto não identificou um produto. Copie o endereço completo do anúncio no Mercado Livre.');
  visited.add(current);
  let response=await http(current,{method:'HEAD',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(6000)});
  if([405,501].includes(response.status)){await response.body?.cancel();response=await http(current,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(6000)});}
  const location=response.headers.get('location');await response.body?.cancel();
  if(![301,302,303,307,308].includes(response.status)||!location)throw new Error('O Mercado Livre não resolveu este link curto. Abra-o e copie o endereço completo do produto.');
  current=mercadoLivreUrl(new URL(location,current).href).href;
 }
 throw new Error('Não foi possível resolver o link.');
}
