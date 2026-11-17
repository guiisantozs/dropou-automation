import type {Product} from './domain';
import {operationCopy} from './workspace-brands';
// Do not transfer commercial claims embedded in titles/features to generated copy.
export function generatedCaptionProduct(p:Product):Product{
 const unsafe=/https?:\/\/|www\.|R\$|US\$|€|%|frete\s+gr[aá]tis|cupom|brinde|[uú]ltimas?\s+unidades?|menor\s+pre[cç]o|desconto|economiz|sem juros/i;
 const generic=operationCopy[p.operation||'dropou'].generic;
 return {...p,name:unsafe.test(p.name)?generic:p.name,shortName:p.shortName&&unsafe.test(p.shortName)?undefined:p.shortName,features:p.features?.filter(f=>!unsafe.test(f))};
}
