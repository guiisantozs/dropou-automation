import {z} from 'zod';
import {operationSchema,type OperationId} from './workspace-brands';
import type {Product} from './domain';
import {publicationIdentityError,savedCaptionError} from './publication-copy';
import type {ScheduledDestination} from './publication-workspace';
export const batchRefSchema=z.object({id:z.uuid(),kind:z.enum(['product','saved']),operation:operationSchema,productId:z.uuid().optional(),repost:z.boolean().default(false)});
export const batchPrepareSchema=z.object({action:z.literal('prepare'),id:z.uuid(),operation:operationSchema,channel:z.enum(['telegram','whatsapp']),scheduledAt:z.string().datetime(),items:z.array(batchRefSchema).min(1).max(50)}).superRefine((b,ctx)=>{
 if(b.items.some(i=>i.operation!==b.operation)||new Set(b.items.map(batchRefKey)).size!==b.items.length)ctx.addIssue({code:'custom',message:'Selecione produtos distintos de uma única operação por lote.'});
});
export const batchCommitSchema=z.object({action:z.literal('confirm'),id:z.uuid(),confirmed:z.literal(true)});
export type BatchRef=z.infer<typeof batchRefSchema>;
export const batchRefKey=(r:Pick<BatchRef,'id'|'kind'|'operation'>)=>r.operation+':'+r.kind+':'+r.id;
/** UI alias only. The backend always resolves the canonical ID from its scoped database read. */
export const batchIdentity=(r:BatchRef)=>r.operation+':'+(r.productId||(r.kind==='product'?r.id:batchRefKey(r)));
export type BatchCandidate={id:string;kind:'product'|'saved';brand_id:OperationId;product_id?:string;data:Partial<Product>;source_data?:{price:number;priceMax:number}|null;reviewed:boolean;published_at?:string;pending:boolean;expired:boolean;archived_at?:string;curation_state:string;saved_state?:string};
export type BatchReviewItem={key:string;name:string;productId?:string;offerId?:string;expected?:Product;caption?:string;error?:string;repost:boolean;publishedAt?:string;presentation?:{mediaMode:'photo'|'text';photoConfirmed:boolean}};
export type BatchReview={id:string;brand_id:OperationId;channel:'telegram'|'whatsapp';scheduled_at:string;target:{title:string;id?:string};items:BatchReviewItem[];executor:{authorized:boolean;note:string};state:string;result?:BatchResult};
export type BatchResult={id:string;scheduledAt:string;items:{key:string;productId?:string;jobId?:string;name:string;state:'queued'|'failed';error?:string}[]};
export function batchDataIssue(p:Product,text:string,source?:BatchCandidate['source_data']){
 if(!Number.isFinite(p.price)||p.price<=0)return 'Preço ausente ou inválido. Complete o cadastro.';
 if(p.inStock===false)return 'Produto indisponível. Confira o estoque na loja.';
 if(source&&source.priceMax>source.price&&!p.visualDetails?.selectedVariant)return 'Escolha e confira a variação e seu preço antes de incluir este produto.';
 if(source&&source.priceMax>source.price&&(p.price<source.price||p.price>source.priceMax))return 'O preço informado está fora da faixa disponível para esta variação. Atualize os dados antes de agendar.';
 return publicationIdentityError(p)||savedCaptionError(text,p);
}
export function mergeBatchPage(selected:BatchRef[],page:BatchRef[],checked:boolean){
 const keys=new Set(page.map(batchIdentity));if(!checked)return selected.filter(i=>!keys.has(batchIdentity(i)));
 const next=new Map(selected.map(i=>[batchIdentity(i),i]));for(const i of page)if(!next.has(batchIdentity(i)))next.set(batchIdentity(i),i);return [...next.values()].slice(0,50);
}
export function groupScheduleBatches(jobs:ScheduledDestination[]){
 const groups=new Map<string,ScheduledDestination[]>();for(const j of jobs){if(['sent','cancelled'].includes(j.state))continue;const key=[j.brand_id,j.schedule_batch_id||j.product_id,j.scheduled_at,j.channel,j.destination_title].join(':');groups.set(key,[...groups.get(key)||[],j]);}
 return [...groups.values()].map(g=>g.sort((a,b)=>(a.schedule_batch_position||0)-(b.schedule_batch_position||0))).sort((a,b)=>Date.parse(a[0].scheduled_at)-Date.parse(b[0].scheduled_at));
}
