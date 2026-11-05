import {Product} from './domain';
export function emptyProduct():Product{return {
 id:crypto.randomUUID(),name:'',niche:'Games',store:'Mercado Livre',price:0,previousPrice:null,
 previousVerified:false,originalUrl:'',affiliateUrl:'',image:'',installments:'',installmentsVerified:false,
 inStock:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:null,status:'encontrado',
 scheduledAt:null,createdAt:new Date().toISOString(),demo:false,
};}
// Dados fornecidos pelo administrador: nunca representam revalidação atual.
export function gtaHistoricalDraft():Product{return {...emptyProduct(),name:'GTA 6 para PS5',price:418.41,previousPrice:449.90,affiliateUrl:'https://meli.la/1oCLqHZ',installments:'8x de R$ 56,24',paymentMethod:'pix'};}
export const productEmoji=(p:Product)=>p.niche==='Games'?'🎮':p.niche==='Monitores'?'🖥️':p.niche==='Hardware'?'💾':'⌨️';
