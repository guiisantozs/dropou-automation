import {sessionDb,apiError,dbError} from '@/server/session';
import {productSchema,productKey} from '@/lib/domain';
import {existingMercadoLivreProduct} from '@/server/mercado-livre/import';
import {mercadoLivreIdentity,mercadoLivreUrl} from '@/lib/mercado-livre-link';
export async function POST(request:Request){try{
 const {db,user,operation}=await sessionDb(request);
 const input=await request.json();const brand=input.operation||(operation==='all'?null:operation);if(!brand||(operation!=='all'&&brand!==operation))throw new Error('Selecione a marca correta para salvar o produto.');const p=productSchema.parse({...input,operation:brand});
 if(p.store==='Mercado Livre'&&p.mercadoLivreImport){
  const meta=p.mercadoLivreImport,identity=mercadoLivreIdentity(meta.resolvedUrl);mercadoLivreUrl(meta.inputUrl);
  if(meta.itemId!==identity.itemId||meta.catalogId&&identity.catalogId&&meta.catalogId!==identity.catalogId)throw new Error('A identificação do anúncio mudou. Importe o link novamente.');
  if(meta.userProductId&&meta.userProductId!==identity.userProductId)throw new Error('A identificação do produto mudou. Importe o link novamente.');
  if(p.originalUrl){const original=mercadoLivreIdentity(p.originalUrl);if(identity.itemId&&original.itemId&&identity.itemId!==original.itemId)throw new Error('O link original pertence a outro anúncio.');}
  if(p.affiliateUrl){const affiliate=mercadoLivreIdentity(p.affiliateUrl);if(identity.itemId&&affiliate.itemId&&identity.itemId!==affiliate.itemId)throw new Error('O link de afiliado leva a outro anúncio.');if(!meta.affiliateConfirmed)throw new Error('Confirme a origem do link de afiliado.');meta.affiliateState='informed';}else{meta.affiliateState='pending';meta.affiliateConfirmed=false;}
  const existing=await existingMercadoLivreProduct(db,user.id,brand,identity.itemId);
  if(existing&&existing.id!==p.id){if(existing.archived_at)throw new Error('Este anúncio está arquivado. Restaure o cadastro existente para preservar o histórico.');return Response.json({product:productSchema.parse(existing.data),existing:true});}
 }
 if(p.imagePath&&!p.imagePath.startsWith(user.id+'/'))throw new Error('A imagem deve pertencer a este usuário.');
 if(p.demo)throw new Error('Dados demonstrativos não podem ser salvos no catálogo real.');
 if(p.checkedAt && (Date.parse(p.checkedAt)>Date.now()+1000))throw new Error('Data de conferência inválida.');
 const {data,error}=await db.rpc('dropou_save_product',{p_data:p,p_key:productKey(p)});
 if(error)throw dbError(error);
 return Response.json({product:productSchema.parse(data)});
}catch(e){return apiError(e);}}
