import {aiError,generateForRequest} from '@/server/ai/service';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request){try{return await generateForRequest(request);}catch(e){return aiError(e);}}
