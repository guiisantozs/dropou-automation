import {sessionDb,apiError} from '@/server/session';
import {integrationStatus} from '@/server/integration-status';
import {oauthError,requireOAuthOrigin} from '@/server/mercado-livre/oauth';
import {OAuthFailure} from '@/server/mercado-livre/oauth-core';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function GET(request:Request){try{const {db,user}=await sessionDb(request);return Response.json(await integrationStatus(db,user.id),{headers});}catch(e){const response=e instanceof OAuthFailure?oauthError(e):apiError(e);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response;}}
export async function POST(request:Request){try{const {db,user}=await sessionDb(request);requireOAuthOrigin(request);return Response.json(await integrationStatus(db,user.id,true),{headers});}catch(e){const response=e instanceof OAuthFailure?oauthError(e):apiError(e);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response;}}
