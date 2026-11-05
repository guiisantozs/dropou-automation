// Pure, injectable HTTP adapter. Credentials are supplied only by the server resolver.
import {z} from 'zod';
import {Product,productSchema} from '../../lib/domain';
import {discoveryCategories,DiscoveryFilters,eligibleCandidates,SourceReport} from '../../lib/discovery';
const base='https://api.mercadolibre.com';
export class OfficialApiError extends Error{constructor(message:string,public status?:number){super(message);}}
const itemSchema=z.object({id:z.string().regex(/^MLB\d+$/),title:z.string().min(3),permalink:z.string().url(),status:z.string().optional(),available_quantity:z.number().optional(),secure_thumbnail:z.string().optional(),pictures:z.array(z.object({secure_url:z.string().optional()})).optional()});
const saleSchema=z.object({amount:z.number().positive().max(1000000),regular_amount:z.number().positive().nullable().optional(),currency_id:z.literal('BRL')});
export function meliItemId(input:string){
 if(/^MLB\d+$/.test(input))return input;
 let u:URL;try{u=new URL(input);}catch{throw new OfficialApiError('Informe uma URL original do Mercado Livre com o ID MLB.');}
 if(u.protocol!=='https:'||!(u.hostname==='mercadolivre.com.br'||u.hostname.endsWith('.mercadolivre.com.br')))throw new OfficialApiError('Use o endereço original do produto, não um encurtador.');
 const match=u.pathname.match(/(?:^|[\/-])(MLB)-?(\d+)(?:\b|_)/i);if(!match)throw new OfficialApiError('Não foi possível identificar o anúncio MLB na URL original.');return `MLB${match[2]}`;
}
export function mercadoLivreClient(config:{token?:string;approved:boolean},http:typeof fetch=fetch){
 function credentials(){if(!config.token||!config.approved)throw new OfficialApiError('Integração pendente: configure MERCADO_LIVRE_ACCESS_TOKEN e confirme a autorização da busca com MERCADO_LIVRE_SEARCH_APPROVED=true.');}
 async function request(path:string){credentials();let response:Response;try{response=await http(base+path,{headers:{Authorization:`Bearer ${config.token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new OfficialApiError('Não foi possível conectar à API oficial do Mercado Livre.');}
  if(!response.ok)throw new OfficialApiError(response.status===403?'Mercado Livre recusou a consulta (HTTP 403). O token não garante acesso à busca; revise permissões da aplicação com a plataforma.':response.status===401?'Mercado Livre recusou o token (HTTP 401). Renove a autorização OAuth.':response.status===429?'Limite da API atingido (HTTP 429). Aguarde antes de tentar novamente.':`API oficial retornou HTTP ${response.status}.`,response.status);
  try{return await response.json();}catch{throw new OfficialApiError('API oficial retornou uma resposta inválida.');}
 }
 async function lookup(input:string,category:DiscoveryFilters['category']='tech'):Promise<Product>{
  const id=meliItemId(input),raw=itemSchema.parse(await request(`/items/${id}`));
  if(raw.id!==id)throw new OfficialApiError('A API retornou outro produto.');
  const pricePath=`/items/${id}/sale_price?context=channel_marketplace`;
  const sale=saleSchema.parse(await request(pricePath)),now=new Date().toISOString();
  const image=raw.pictures?.map(p=>p.secure_url).find(v=>v?.startsWith('https:'))||raw.secure_thumbnail||'';
  // regular_amount is a promotional reference, not proof of a previous transaction price.
  return productSchema.parse({id:crypto.randomUUID(),name:raw.title,niche:discoveryCategories[category].label,store:'Mercado Livre',price:sale.amount,previousPrice:null,previousVerified:false,originalUrl:raw.permalink,affiliateUrl:'',image:image.startsWith('https:')?image:'',installments:'',installmentsVerified:false,inStock:raw.status==='active'&&typeof raw.available_quantity==='number'?raw.available_quantity>0:raw.status&&raw.status!=='active'?false:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:now,status:'aguardando link',scheduledAt:null,createdAt:now,demo:false,source:{provider:'mercado_livre',itemId:id,verifiedAt:now,priceEndpoint:base+pricePath,referenceAmount:sale.regular_amount??null,previousEvidence:'none'}});
 }
 async function search(f:DiscoveryFilters):Promise<{products:Product[];report:SourceReport}>{
  const report:SourceReport={store:'Mercado Livre',state:'pending',message:'Integração pendente',found:0,discarded:0,errors:[],checkedAt:new Date().toISOString()};
  if(!config.token||!config.approved){report.message='Integração pendente: faltam token OAuth e autorização de busca da aplicação.';return {products:[],report};}
  const products:Product[]=[];
  try{
   await request('/users/me');
   const params=new URLSearchParams({category:discoveryCategories[f.category].meli,limit:String(Math.min(f.limit*2,20)),price:`${f.minPrice}-${f.maxPrice}`});
   const data=z.object({results:z.array(z.object({id:z.string().regex(/^MLB\d+$/)}))}).parse(await request(`/sites/MLB/search?${params}`));
   const ids=[...new Set(data.results.map(r=>r.id))];
   for(const id of ids.slice(0,20)){
    try{products.push(await lookup(id,f.category));}catch(e){
     if(e instanceof OfficialApiError&&[401,403,429].includes(e.status||0))throw e;
     report.errors.push(`${id}: não foi possível verificar os dados e o preço oficiais.`);
    }
    if(eligibleCandidates(products,f).length>=f.limit)break;
   }
   const selected=eligibleCandidates(products,f);report.state='available';report.found=selected.length;report.discarded=ids.length-selected.length;
   report.message=selected.length?`${selected.length} produtos verificados na API oficial.`:'Consulta autorizada, mas nenhum produto passou pelos filtros e verificações.';
   return {products:selected,report};
  }catch(e){report.state=e instanceof OfficialApiError&&[401,403].includes(e.status||0)?'denied':'error';report.httpStatus=e instanceof OfficialApiError?e.status:undefined;report.message=e instanceof OfficialApiError?e.message:'Resposta incompatível com o contrato documentado da API. Nenhum resultado foi considerado verificado.';return {products:[],report};}
 }
 return {lookup,search};
}
