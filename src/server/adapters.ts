import 'server-only';
import type { Product } from '@/lib/domain';
import {meliForUser} from './discovery';
export interface OfficialAdapter {
  generateAffiliateLink?(product:Product):Promise<string>;
  lookup(url:string,ownerId?:string):Promise<Product>;
  search(niches:string[],ownerId?:string):Promise<Product[]>;
  revalidate(product:Product,ownerId?:string):Promise<Product>;
}
// Intentionally no marketplace endpoints: activation requires approved access,
// official documentation, credentials and contract tests for that account.
class PendingApproval implements OfficialAdapter {
  constructor(private marketplace:string){}
  async generateAffiliateLink(_p:Product):Promise<string>{throw new Error(`${this.marketplace}: geração de links pendente de aprovação, credenciais e documentação oficial da conta`);}
  async lookup(_url:string):Promise<Product> { throw new Error(`${this.marketplace}: consulta oficial ainda não autorizada/configurada`); }
  async search(_niches:string[]):Promise<Product[]> { throw new Error(`${this.marketplace}: acesso oficial ainda não configurado`); }
  async revalidate(_p:Product):Promise<Product> { throw new Error(`${this.marketplace}: revalidação oficial indisponível`); }
}
export const adapters:Record<Product['store'],OfficialAdapter> = {
  'Mercado Livre':{
    lookup:async(url,owner)=> (await meliForUser(owner)).lookup(url),
    search:async(_niches,owner)=>{const result=await (await meliForUser(owner)).search({store:'Mercado Livre',category:'tech',minPrice:0,maxPrice:1000000,minDiscount:0,limit:5});if(result.report.state!=='available')throw new Error(result.report.message);return result.products;},
    revalidate:async(p,owner)=>{const fresh=await (await meliForUser(owner)).lookup(p.source?.itemId||p.originalUrl);return {...fresh,id:p.id,niche:p.niche,createdAt:p.createdAt,affiliateUrl:p.affiliateUrl,status:p.status,scheduledAt:p.scheduledAt,dataOrigin:p.dataOrigin,imagePath:p.imagePath,features:p.features,featuresVerified:p.featuresVerified};},
  },
  'Shopee':new PendingApproval('Shopee Open API'),
};
