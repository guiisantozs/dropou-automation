'use client';
import {useState} from 'react';
import {money,type Product} from '@/lib/domain';
export default function ImportedProductSummary({product}:{product:Product}){
 const [failed,setFailed]=useState('');
 return <div className="imported-product-summary"><div className="imported-product-photo">{product.image&&failed!==product.image?<img src={product.image} alt={product.name||'Imagem do produto'} onError={()=>setFailed(product.image)}/>:<span>Adicione uma foto ou print</span>}</div><div><span className="eyebrow">{product.store}</span><h3>{product.name||'Nome pendente'}</h3><p>{product.price>0?money(product.price):'Preço pendente'}</p><small>{product.mercadoLivreImport?.itemId||product.mercadoLivreImport?.catalogId||product.mercadoLivreImport?.userProductId||'Confira o produto na loja'}{product.mercadoLivreImport?.referenceCatalogId?' · foto e nome de referência escolhidos por você':''}</small></div></div>;
}
