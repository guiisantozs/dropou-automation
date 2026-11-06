import type {Product} from './domain';
import type {Offer} from './offers';
export function acceptOfferUpdate(current:{product:Product;offer?:Offer},incoming:{product:Product;offer?:Offer}){
 if(current.product===incoming.product&&current.offer===incoming.offer)return current;
 if(current.product.id!==incoming.product.id)return incoming;
 if(current.offer&&incoming.offer&&Date.parse(incoming.offer.updated_at)<Date.parse(current.offer.updated_at))return current;
 return incoming;
}
export function confirmedOfferUpdate(current:{product:Product;offer?:Offer},offer:Offer){
 if(offer.product_id!==current.product.id||offer.snapshot.id!==current.product.id)throw new Error('A confirmação pertence a outra oferta. Reabra o produto selecionado.');
 return acceptOfferUpdate(current,{product:offer.snapshot,offer});
}
