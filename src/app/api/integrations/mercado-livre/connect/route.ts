import {NextResponse} from 'next/server';
import {sessionDb,apiError} from '@/server/session';
import {oauthCookie,oauthError,requireOAuthOrigin,startOAuth} from '@/server/mercado-livre/oauth';
import {OAuthFailure} from '@/server/mercado-livre/oauth-core';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {user}=await sessionDb(request);requireOAuthOrigin(request);const result=await startOAuth(user.id);
 const response=NextResponse.json({authorizationUrl:result.url},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(oauthCookie,result.browser,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});return response;
}catch(e){return e instanceof OAuthFailure?oauthError(e):apiError(e);}}
