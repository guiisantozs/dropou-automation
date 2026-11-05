import 'server-only';
import type { Product } from '@/lib/domain';
export interface OfficialAdapter {
  search(niches:string[]):Promise<Product[]>;
  revalidate(product:Product):Promise<Product>;
}
// Intentionally no marketplace endpoints: activation requires approved access,
// official documentation, credentials and contract tests for that account.
class PendingApproval implements OfficialAdapter {
  constructor(private marketplace:string){}
  async search(_niches:string[]):Promise<Product[]> { throw new Error(`${this.marketplace}: acesso oficial ainda não configurado`); }
  async revalidate(_p:Product):Promise<Product> { throw new Error(`${this.marketplace}: revalidação oficial indisponível`); }
}
export const adapters:Record<Product['store'],OfficialAdapter> = {
  'Mercado Livre':new PendingApproval('Mercado Livre'),
  'Shopee':new PendingApproval('Shopee Open API'),
};
