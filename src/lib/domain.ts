import { z } from 'zod';

export const statuses = ['encontrado', 'aguardando link', 'pronto', 'agendado', 'publicado'] as const;
const webUrl = z.string().url().refine(v => { try {const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password;} catch {return false;} }, 'Use uma URL HTTPS sem credenciais');
export const productSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(3).max(180), niche: z.string().trim().min(2).max(60),
  store: z.enum(['Mercado Livre', 'Shopee']), price: z.number().positive().max(1000000),
  previousPrice: z.number().positive().max(1000000).nullable(), previousVerified: z.boolean(),
  originalUrl: webUrl, affiliateUrl: z.union([webUrl, z.literal('')]), image: z.union([webUrl, z.literal('')]),
  installments: z.string().max(100), installmentsVerified: z.boolean(), inStock: z.boolean(),
  checkedAt: z.string().datetime().nullable(), status: z.enum(statuses), scheduledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(), demo: z.boolean(),
}).superRefine((p, ctx) => {
  if (!URL.canParse(p.originalUrl) || (p.affiliateUrl && !URL.canParse(p.affiliateUrl))) return;
  const host = new URL(p.originalUrl).hostname;
  const domains = p.store === 'Mercado Livre' ? ['mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com'] : ['shopee.com.br'];
  if (!domains.some(d => host === d || host.endsWith('.' + d))) ctx.addIssue({code: 'custom', path:['originalUrl'], message:'O link original deve pertencer à loja selecionada'});
  if (p.affiliateUrl) {
    const h = new URL(p.affiliateUrl).hostname;
    const allowed = p.store === 'Mercado Livre' ? [...domains, 'meli.la'] : [...domains, 'shope.ee', 's.shopee.com.br'];
    if (!allowed.some(d => h === d || h.endsWith('.' + d))) ctx.addIssue({code:'custom',path:['affiliateUrl'],message:'Domínio de afiliado não reconhecido para esta loja'});
  }
});
export type Product = z.infer<typeof productSchema>;
export const money = (n: number) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n);
export function discount(p: Product) { return p.previousVerified && p.previousPrice && p.previousPrice > p.price ? Math.floor(((Math.round(p.previousPrice*100)-Math.round(p.price*100))*100)/Math.round(p.previousPrice*100)) : null; }
export function caption(p: Product) {
  const verified = p.previousVerified && p.previousPrice && p.previousPrice > p.price;
  return ['🚨 PRODUTO EM OFERTA! #publi', p.name, verified ? `De: ${money(p.previousPrice!)}` : '', `🔥 ${money(p.price)}`, verified ? `Economia real: ${money(p.previousPrice! - p.price)} (${discount(p)}%)` : '', p.installmentsVerified ? p.installments : '', p.affiliateUrl, '💙 Dropou o preço? A gente te avisa!'].filter(Boolean).join('\n');
}
export function canonical(url: string) { const u = new URL(url); return u.hostname.toLowerCase().replace(/^www\./,'') + u.pathname.replace(/\/$/,''); }
export function publicationError(p: Product, now = Date.now()): string | null {
  if (p.demo) return 'Dados demonstrativos não podem ser publicados de verdade.';
  if (!p.affiliateUrl) return 'Adicione um link oficial de afiliado.';
  if (!p.inStock) return 'Produto esgotado.';
  if (!p.checkedAt || now - Date.parse(p.checkedAt) > 15*60*1000 || Date.parse(p.checkedAt) > now+1000) return 'Revalide preço e estoque nos últimos 15 minutos.';
  if (!['pronto','agendado'].includes(p.status)) return 'A oferta precisa estar pronta ou agendada.';
  return null;
}
export function transitionError(p:Product, next:Product['status']):string|null {
  if(p.status==='publicado' && next!=='publicado')return 'Uma oferta publicada permanece no histórico para evitar repetição.';
  if(p.demo)return null;
  if(next==='publicado')return publicationError(p);
  return ['pronto','agendado','publicado'].includes(next) ? publicationError({...p,status:'pronto'}) : null;
}
export function cleanCandidates(items: Product[], now = Date.now()) {
  const seen = new Set<string>();
  return [...items].sort((a,b)=>Date.parse(b.checkedAt || b.createdAt)-Date.parse(a.checkedAt || a.createdAt)).filter(p=>{
    const key = canonical(p.originalUrl);
    if (seen.has(key) || !p.inStock || !p.checkedAt || now-Date.parse(p.checkedAt)>15*60*1000 || p.status==='publicado') return false;
    seen.add(key); return true;
  });
}
export type Schedule = { enabled: boolean; timezone: 'America/Bahia'; times: string[]; telegram: boolean };
export const defaultSchedule: Schedule = {enabled:false, timezone:'America/Bahia', times:['09:00','12:00','16:00','20:00'], telegram:false};
export function scheduleSlot(config: Schedule, now = new Date()) {
  if (!config.enabled) return null;
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = (t:string)=>parts.find(p=>p.type===t)!.value;
  const time = `${get('hour')}:${get('minute')}`;
  return config.times.includes(time) ? `${get('year')}-${get('month')}-${get('day')}T${time}` : null;
}
