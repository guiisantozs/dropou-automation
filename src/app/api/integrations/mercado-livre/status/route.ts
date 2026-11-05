import {sessionDb,apiError} from '@/server/session';
import {oauthError,oauthStatus} from '@/server/mercado-livre/oauth';
import {OAuthFailure} from '@/server/mercado-livre/oauth-core';
export async function GET(request:Request){try{const {user}=await sessionDb(request);return Response.json(await oauthStatus(user.id),{headers:{'Cache-Control':'no-store'}});}catch(e){return e instanceof OAuthFailure?oauthError(e):apiError(e);}}
