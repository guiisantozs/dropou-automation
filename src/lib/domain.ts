import { z } from 'zod';

export const statuses = ['encontrado', 'aguardando link', 'pronto', 'agendado', 'publicado'] as const;
const webUrl = z.string().url().refine(v => { try {const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password;} catch {return false;} }, 'Use uma URL HTTPS sem credenciais');
export const productSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(3).max(180), niche: z.string().trim().min(2).max(60),
  store: z.enum(['Mercado Livre', 'Shopee']), price: z.number().positive().max(1000000),
  previousPrice: z.number().positive().max(1000000).nullable(), previousVerified: z.boolean(),
  originalUrl: z.union([webUrl, z.literal('')]), affiliateUrl: z.union([webUrl, z.literal('')]), image: z.union([webUrl, z.literal('')]),
  installments: z.string().max(100), installmentsVerified: z.boolean(), inStock: z.boolean().nullable(),
  paymentMethod: z.enum(['nao_informado','pix','outro']).default('nao_informado'), pixVerified: z.boolean().default(false),
  checkedAt: z.string().datetime().nullable(), status: z.enum(statuses), scheduledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(), demo: z.boolean(),
}).superRefine((p, ctx) => {
  if (!p.originalUrl && !p.affiliateUrl) ctx.addIssue({code:'custom',path:['affiliateUrl'],message:'Informe o link original ou um link de afiliado oficial'});
  if ((p.originalUrl && !URL.canParse(p.originalUrl)) || (p.affiliateUrl && !URL.canParse(p.affiliateUrl))) return;
  const host = p.originalUrl ? new URL(p.originalUrl).hostname : '';
  const domains = p.store === 'Mercado Livre' ? ['mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com'] : ['shopee.com.br'];
  if (host && !domains.some(d => host === d || host.endsWith('.' + d))) ctx.addIssue({code: 'custom', path:['originalUrl'], message:'O link original deve pertencer à loja selecionada'});
  if (p.affiliateUrl) {
    const h = new URL(p.affiliateUrl).hostname;
    const allowed = p.store === 'Mercado Livre' ? [...domains, 'meli.la'] : [...domains, 'shope.ee', 's.shopee.com.br'];
    if (!allowed.some(d => h === d || h.endsWith('.' + d))) ctx.addIssue({code:'custom',path:['affiliateUrl'],message:'Domínio de afiliado não reconhecido para esta loja'});
  }
});
export type Product = z.infer<typeof productSchema>;
export const money = (n: number) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n);
export function discount(p: Product) { return freshPrice(p) && p.previousVerified && p.previousPrice && p.previousPrice > p.price ? Math.floor(((Math.round(p.previousPrice*100)-Math.round(p.price*100))*100)/Math.round(p.previousPrice*100)) : null; }
export function freshPrice(p:Product, now=Date.now()) {
  const checked=p.checkedAt?Date.parse(p.checkedAt):NaN;
  return Number.isFinite(checked)&&checked<=now+1000&&now-checked<=15*60*1000;
}
export function caption(p: Product, now=Date.now()) {
  if(!freshPrice(p,now) || (p.paymentMethod==='pix'&&!p.pixVerified)) return [
    '⚠️ RASCUNHO — valores históricos ou não revalidados',p.name,
    `Preço registrado: ${money(p.price)} (não confirmado como atual)`,
    'Revalide o preço e as condições na loja antes de compartilhar.',p.affiliateUrl,
  ].filter(Boolean).join('\n');
  const verified = p.previousVerified && p.previousPrice && p.previousPrice > p.price;
  const prices=[verified?`💸 De: ${money(p.previousPrice!)}`:'',`🔥 ${money(p.price)}${p.paymentMethod==='pix'&&p.pixVerified?' no Pix':''}!`,verified?`💰 Economize ${money((Math.round(p.previousPrice!*100)-Math.round(p.price*100))/100)}!`:''].filter(Boolean).join('\n');
  return [`🚨 ${p.name.toLocaleUpperCase('pt-BR')} EM OFERTA! #publi`,prices,p.installmentsVerified&&p.installments?`💳 ${p.installments}`:'',p.affiliateUrl?`🛒 GARANTA O SEU 👇\n${p.affiliateUrl}`:'','💙 Dropou o preço? A gente te avisa!'].filter(Boolean).join('\n\n');
}
export function canonical(url: string) { const u = new URL(url); return u.hostname.toLowerCase().replace(/^www\./,'') + u.pathname.replace(/\/$/,''); }
export const productKey=(p:Product)=>canonical(p.originalUrl||p.affiliateUrl);
export function publicationError(p: Product, now = Date.now()): string | null {
  if (p.demo) return 'Dados demonstrativos não podem ser publicados de verdade.';
  if (!p.affiliateUrl) return 'Adicione um link oficial de afiliado.';
  if (p.inStock!==true) return 'Confirme que o produto está em estoque.';
  if (!freshPrice(p,now)) return 'Revalide preço e estoque nos últimos 15 minutos.';
  if(p.paymentMethod==='pix'&&!p.pixVerified)return 'Confirme que o preço é válido no Pix.';
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
    const key = productKey(p);
    if (seen.has(key) || p.inStock!==true || !freshPrice(p,now) || p.status==='publicado') return false;
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
