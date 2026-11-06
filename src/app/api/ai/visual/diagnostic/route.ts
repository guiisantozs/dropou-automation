import {aiError,aiSession} from '@/server/ai/service';
import {modelConfig} from '@/server/ai/core';
import {checkModel} from '@/server/ai/model-check';
export async function POST(request:Request){try{
 await aiSession(request);const {model}=modelConfig();
 return Response.json({model,...await checkModel(model,process.env.OPENAI_API_KEY)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return aiError(e);}}
