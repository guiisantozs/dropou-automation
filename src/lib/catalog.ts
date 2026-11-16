import {z} from 'zod';
import type {Product} from './domain';
import {operationSchema} from './workspace-brands';
export const catalogFiltersSchema=z.object({
 page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().trim().max(180).default(''),
 operation:operationSchema.optional(),store:z.enum(['Shopee','Mercado Livre']).optional(),category:z.string().max(100).optional(),
 status:z.enum(['active','published','unpublished','missing','archived','rejected']).default('active'),channel:z.enum(['telegram','whatsapp']).optional(),
 retention:z.enum(['active','expired','all']).default('active'),pinned:z.enum(['true','false']).default('false'),
 from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CatalogDestination={channel:'telegram'|'whatsapp';name:string;destinationId?:string;publishedAt?:string|null;source?:string;state:string;scheduledAt?:string};
export type CatalogRow={id:string;brand_id:Product['operation'];data:Product;kind:'product'|'saved';entered_at:string;expires_at:string;pinned:boolean;published_at?:string;archived_at?:string;curation_state:string;saved_state?:string;saved_error?:string;destinations:CatalogDestination[]};
export type CatalogPage={rows:CatalogRow[];total:number;page:number;more:boolean;serverNow:string;categories?:string[]};
export function catalogRetention(row:Pick<CatalogRow,'pinned'|'expires_at'>,now:number){
 if(row.pinned)return {label:'Eterno (sem expiração)',state:'pinned'};
 const left=Date.parse(row.expires_at)-now;
 if(!Number.isFinite(left))return {label:'Prazo indisponível',state:'unknown'};
 if(left<=0)return {label:'Expirado',state:'expired'};
 const days=Math.ceil(left/86400000);return {label:`${days===1?'Resta 1 dia':'Restam '+days+' dias'}`,state:days<=6?'soon':'active'};
}
