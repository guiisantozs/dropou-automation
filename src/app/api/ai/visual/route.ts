import {aiError,aiSession} from '@/server/ai/service';
import {modelConfig} from '@/server/ai/core';
import {analyzeVisual,limitedJson,visualEstimate,visualRequestSchema} from '@/server/ai/visual-core';
import {visualStore} from '@/server/ai/visual-service';
import {affiliateStore} from '@/lib/affiliate';
import {emptyProduct} from '@/lib/product-draft';
import {visualDraft,visualPreview} from '@/lib/visual';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){try{
 await aiSession(request);const config=modelConfig();
 return Response.json({model:config.model,enabled:process.env.OPENAI_ENABLED==='true'&&process.env.OPENAI_VISION_ENABLED==='true'&&!!process.env.OPENAI_API_KEY,estimates:[1,2,3].map(count=>({images:count,reservedUsd:visualEstimate(count,config.rates)}))},{headers:{'Cache-Control':'no-store'}});
}catch(e){return aiError(e);}}
export async function POST(request:Request){try{
 const {user}=await aiSession(request),body=visualRequestSchema.parse(await limitedJson(request));
 const store=affiliateStore(body.url),config=modelConfig();
 const result=await analyzeVisual(body.images,body.brand,visualStore(user.id),{...config,key:process.env.OPENAI_API_KEY,enabled:process.env.OPENAI_ENABLED==='true'&&process.env.OPENAI_VISION_ENABLED==='true'});
 // The link is supplied by the authenticated request, never by the model.
 const draft=result.extraction?visualDraft({...emptyProduct(),store,affiliateUrl:body.url},result.extraction,body.brand):undefined;
 return Response.json({...result,draft,preview:draft?visualPreview(draft,body.brand):undefined},{headers:{'Cache-Control':'no-store'}});
}catch(e){return aiError(e);}}
