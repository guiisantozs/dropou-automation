import { Product } from './domain';
const examples = [
 ['Headset gamer sem fio','Games',279.9,349.9,'Mercado Livre','🎧','pronto'],
 ['Teclado mecânico RGB','Periféricos',189.9,249.9,'Shopee','⌨️','aguardando link'],
 ['Controle sem fio para PC','Games',229.9,299.9,'Mercado Livre','🎮','encontrado'],
 ['Monitor gamer 27” 165 Hz','Monitores',999.9,1299.9,'Shopee','🖥️','pronto'],
 ['Mouse gamer ultraleve','Periféricos',129.9,null,'Mercado Livre','🖱️','aguardando link'],
 ['SSD NVMe 1 TB','Hardware',359.9,449.9,'Shopee','💾','encontrado'],
] as const;
export function demoProducts(): Product[] { return examples.map(([name,niche,price,previousPrice,store,,status],i)=>({ id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,niche,price,previousPrice,store,status,previousVerified:previousPrice!==null, originalUrl:store==='Shopee'?`https://shopee.com.br/demo-${i+1}`:`https://www.mercadolivre.com.br/demo-${i+1}`,affiliateUrl:'',image:'',installments:'',installmentsVerified:false,inStock:true,checkedAt:new Date().toISOString(),createdAt:new Date().toISOString(),scheduledAt:null,demo:true })); }
export const productEmoji = (p:Product) => p.niche==='Games'?'🎮':p.niche==='Monitores'?'🖥️':p.niche==='Hardware'?'💾':'⌨️';
