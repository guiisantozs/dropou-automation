'use client';
import {useEffect,useState} from 'react';
import {Cpu,Gamepad2,Headphones,Keyboard,Monitor,Package,Smartphone,Wrench,Disc3} from 'lucide-react';
import {categoryIcon} from '@/lib/commerce';
import type {Product} from '@/lib/domain';
import {privateImageUrl} from '@/lib/private-image';
const icons={cpu:Cpu,controller:Gamepad2,monitor:Monitor,game:Disc3,headset:Headphones,tool:Wrench,keyboard:Keyboard,phone:Smartphone,package:Package};
export default function ProductMedia({product,large=false}:{product:Pick<Product,'name'|'niche'|'image'|'imagePath'|'thumbnailPath'>;large?:boolean}){
 const path=product.thumbnailPath||product.imagePath,[url,setUrl]=useState(path?'':product.image),[failed,setFailed]=useState(false);
 useEffect(()=>{let disposed=false;setFailed(false);setUrl(path?'':product.image);if(path)privateImageUrl(path).then(url=>{if(!disposed)setUrl(url);}).catch(()=>{if(!disposed)setFailed(true);});return()=>{disposed=true;};},[path,product.image]);
 const Icon=icons[categoryIcon(product)];
 return <span className={'product-media'+(large?' large':'')} aria-label={url&&!failed?'Foto de '+product.name:'Sem foto · '+product.niche}>{url&&!failed?<img src={url} alt={product.name} referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailed(true)}/>:<Icon size={large?48:25} strokeWidth={1.6}/>}</span>;
}
