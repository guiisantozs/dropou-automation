import Papa from 'papaparse';
import { Product, productSchema, canonical } from './domain';
const yes = (s?:string)=>['true','1','sim'].includes((s||'').toLowerCase());
export function importCsv(text:string, existing:Product[]) {
  const parsed = Papa.parse<Record<string,string>>(text,{header:true,skipEmptyLines:'greedy',transformHeader:s=>s.trim()});
  if (parsed.errors.length) throw new Error(`CSV inválido: ${parsed.errors[0].message}`);
  if (parsed.data.length > 1000) throw new Error('Importe no máximo 1.000 linhas.');
  const products:Product[]=[]; const errors:string[]=[]; const seen = new Set(existing.map(p=>canonical(p.originalUrl)));
  parsed.data.forEach((r,i)=>{
    const candidate = productSchema.safeParse({id:crypto.randomUUID(),name:r.nome,niche:r.nicho,store:r.loja,price:Number(r.preco),previousPrice:r.preco_anterior?Number(r.preco_anterior):null,previousVerified:yes(r.preco_anterior_verificado),originalUrl:r.link_original,affiliateUrl:r.link_afiliado||'',image:r.imagem||'',installments:r.parcelamento||'',installmentsVerified:yes(r.parcelamento_verificado),inStock:!['false','0','nao'].includes(r.estoque?.toLowerCase()),checkedAt:null,status:r.link_afiliado?'encontrado':'aguardando link',scheduledAt:null,createdAt:new Date().toISOString(),demo:false});
    if (!candidate.success) {errors.push(`Linha ${i+2}: ${candidate.error.issues.map(e=>e.message).join('; ')}`); return;}
    const key=canonical(candidate.data.originalUrl);
    if(seen.has(key)){errors.push(`Linha ${i+2}: produto duplicado`);return;}
    seen.add(key);products.push(candidate.data);
  });return {products,errors};
}
