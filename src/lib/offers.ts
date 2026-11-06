import { publicationError, Product } from './domain';
export type Offer={id:string;product_id:string;caption:string;original_caption?:string|null;manually_edited?:boolean;snapshot:Product;status:'rascunho'|'pronto'|'publicado'|'excluido';created_at:string;updated_at:string};
export type Publication={id:string;offer_id:string;product_id:string;channel:'whatsapp';caption:string;snapshot:Product;published_at:string};
export function metrics(products:Product[],offers:Offer[],publications:Publication[]){
 return {products:products.filter(p=>!p.demo).length,ready:offers.filter(o=>o.status==='pronto'&&!publicationError({...o.snapshot,status:'pronto'})).length,waiting:products.filter(p=>!p.demo&&!p.affiliateUrl).length,published:publications.filter(p=>!p.snapshot.demo).length};
}
