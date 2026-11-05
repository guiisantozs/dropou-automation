import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mercadoLivreClient,meliItemId} from '../src/server/discovery/mercado-livre';
import {DiscoveryFilters,eligibleCandidates,discoveryFiltersSchema,withRecordedHistory} from '../src/lib/discovery';
import {caption} from '../src/lib/domain';
import {copyText} from '../src/lib/clipboard';
const filters:DiscoveryFilters={store:'Mercado Livre',category:'tech',minPrice:0,maxPrice:10000,minDiscount:0,limit:5};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('sem credenciais a busca é pendente, vazia e não realiza HTTP',async()=>{
 let calls=0;const client=mercadoLivreClient({approved:false},async()=>{calls++;throw new Error('Não deveria chamar');});
 const r=await client.search(filters);assert.equal(r.report.state,'pending');assert.equal(r.products.length,0);assert.equal(calls,0);
});
test('token válido em users/me não é considerado autorização de busca',async()=>{
 const calls:string[]=[];const client=mercadoLivreClient({token:'token-de-teste',approved:true},async input=>{const url=String(input);calls.push(url);return url.endsWith('/users/me')?response({id:123}):response({error:'forbidden'},403);});
 const r=await client.search(filters);assert.equal(r.report.state,'denied');assert.equal(r.report.httpStatus,403);assert.equal(r.products.length,0);assert.equal(calls.length,2);
});
test('contrato oficial: cinco produtos, preço por sale_price, IDs únicos e nenhuma economia inventada',async()=>{
 const calls:string[]=[];
 const client=mercadoLivreClient({token:'token-de-teste',approved:true},async(input,init)=>{
  const url=String(input);calls.push(url);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer token-de-teste');
  if(url.endsWith('/users/me'))return response({id:123});
  if(url.includes('/search?'))return response({results:[{id:'MLB100001'},...Array.from({length:5},(_,i)=>({id:`MLB${100001+i}`}))]});
  if(url.includes('/sale_price?'))return response({amount:199.9,regular_amount:299.9,currency_id:'BRL'});
  const id=url.split('/').pop()!;return response({id,title:`Produto de contrato ${id}`,permalink:`https://www.mercadolivre.com.br/${id}`,status:'active',available_quantity:2,secure_thumbnail:'https://http2.mlstatic.com/teste.jpg'});
 });
 const r=await client.search(filters);assert.equal(r.report.state,'available');assert.equal(r.products.length,5);assert.equal(new Set(r.products.map(p=>p.source!.itemId)).size,5);
 for(const p of r.products){assert.equal(p.price,199.9);assert.equal(p.previousPrice,null);assert.equal(p.previousVerified,false);assert.equal(p.source!.referenceAmount,299.9);assert.equal(p.affiliateUrl,'');assert.equal(p.pixVerified,false);assert.ok(!caption(p).includes('Economize'));assert.ok(!caption(p).includes('no Pix'));}
 assert.equal(calls.filter(u=>u.includes('/sale_price?')).length,5);
 assert.equal(eligibleCandidates(r.products,{...filters,minDiscount:1}).length,0);
});
test('se a API de preço falhar, não usa o preço de busca ou dados antigos como fallback',async()=>{
 const client=mercadoLivreClient({token:'token-de-teste',approved:true},async input=>{
  const url=String(input);if(url.endsWith('/users/me'))return response({id:123});
  if(url.includes('/search?'))return response({results:[{id:'MLB100001',price:1}]});
  if(url.includes('/sale_price?'))return response({},403);
  return response({id:'MLB100001',title:'Produto de contrato',permalink:'https://www.mercadolivre.com.br/MLB100001',status:'active',available_quantity:1,price:1});
 });
 const r=await client.search(filters);assert.equal(r.products.length,0);assert.equal(r.report.httpStatus,403);
});
test('não presume estoque ausente; exclui esgotados e aplica faixa de preço',async()=>{
 const client=mercadoLivreClient({token:'token-de-teste',approved:true},async input=>{
  if(String(input).includes('/sale_price?'))return response({amount:100,currency_id:'BRL'});
  return response({id:'MLB100001',title:'Produto de contrato',permalink:'https://www.mercadolivre.com.br/MLB100001',status:'active'});
 });
 const p=await client.lookup('MLB100001','games');assert.equal(p.inStock,null);assert.equal(p.niche,'Games');
 assert.equal(eligibleCandidates([p,{...p}],filters).length,1);
 assert.equal(eligibleCandidates([{...p,inStock:false}],filters).length,0);
 assert.equal(eligibleCandidates([p],{...filters,minPrice:101}).length,0);
});
test('URL de consulta não permite outro host, encurtador ou caminho arbitrário',()=>{
 assert.equal(meliItemId('https://produto.mercadolivre.com.br/MLB-100001-controle'),'MLB100001');
 assert.throws(()=>meliItemId('https://mercadolivre.com.br.evil.test/MLB-100001'));
 assert.throws(()=>meliItemId('https://meli.la/nao-resolver'));
 assert.throws(()=>meliItemId('https://www.mercadolivre.com.br/sem-id'));
 assert.equal(discoveryFiltersSchema.safeParse({...filters,limit:500}).success,false);
 assert.equal(discoveryFiltersSchema.safeParse({...filters,minPrice:100,maxPrice:10}).success,false);
});
test('cópia individual de várias ofertas mantém o texto e o link de cada item',async()=>{
 const copied:string[]=[];const clipboard={writeText:async(value:string)=>{copied.push(value);}};
 await copyText('Oferta 1\nhttps://meli.la/link1',clipboard);await copyText('Oferta 2\nhttps://meli.la/link2',clipboard);
 assert.equal(copied.length,2);assert.ok(copied[0].includes('link1'));assert.ok(!copied[1].includes('link1'));
});

test('desconto exige observação anterior do mesmo produto e condição de pagamento',async()=>{
 const client=mercadoLivreClient({token:'synthetic',approved:true},async input=>String(input).includes('/sale_price?')?response({amount:100,regular_amount:500,currency_id:'BRL'}):response({id:'MLB100001',title:'Contrato',permalink:'https://www.mercadolivre.com.br/MLB100001',status:'active',available_quantity:1}));
 const p=await client.lookup('MLB100001','tech'),checkedAt=new Date(Date.now()-86400000).toISOString();
 const historical={...p,price:120,checkedAt,source:{...p.source!,verifiedAt:checkedAt}};
 assert.equal(withRecordedHistory([p],[historical])[0].previousPrice,120);
 assert.equal(withRecordedHistory([p],[{...historical,demo:true}])[0].previousVerified,false);
 assert.equal(withRecordedHistory([p],[{...historical,source:{...historical.source,itemId:'MLB999999'}}])[0].previousVerified,false);
 assert.equal(withRecordedHistory([p],[{...historical,paymentMethod:'pix'}])[0].previousVerified,false);
 assert.equal(withRecordedHistory([p],[{...historical,price:90}])[0].previousVerified,false);
 assert.equal(withRecordedHistory([p],[{...historical,checkedAt:new Date(0).toISOString()}])[0].previousVerified,false);
});
