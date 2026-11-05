import {NextRequest,NextResponse} from 'next/server';
import {finishOAuth,oauthCookie,oauthError} from '@/server/mercado-livre/oauth';
import {OAuthFailure} from '@/server/mercado-livre/oauth-core';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 let response:Response;
 try{
  if(request.nextUrl.searchParams.getAll('state').length!==1||request.nextUrl.searchParams.getAll('code').length!==1||request.nextUrl.searchParams.has('error'))throw new OAuthFailure('state','Autorização cancelada ou callback inválido. Inicie novamente pelo Dropou.');
  await finishOAuth({state:request.nextUrl.searchParams.get('state')||'',code:request.nextUrl.searchParams.get('code')||'',browser:request.cookies.get(oauthCookie)?.value||''});
  response=NextResponse.redirect(new URL('/?mercado_livre=connected',process.env.APP_BASE_URL!),303);
 }catch(e){response=oauthError(e);}
 response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');response.headers.append('Set-Cookie',`${oauthCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return response;
}
