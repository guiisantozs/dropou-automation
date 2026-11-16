// Local QA process only; never included in deploys. No external fetch is allowed.
if(process.env.DROPOU_LOCAL_AUTH_FIXTURE!=='1'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://dropou-preview.supabase.co')throw Error('Explicit local fixture mode and dummy Supabase URL required.');
const owner='20000000-0000-4000-8000-000000000001',karen='20000000-0000-4000-8000-000000000002';
const brands=['dropou','bruto','moda','celulares','tenis','automoto','beleza','casa','natal'];
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),headers=new Headers(init.headers||input.headers||{}),token=(headers.get('authorization')||'').replace(/^Bearer /,'');
 if(url.hostname!=='dropou-preview.supabase.co')throw Error('QA blocked external network: '+url.hostname);
 let id=token==='fixture-admin'?owner:karen;try{id=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub||id;}catch{}
 const admin=id===owner,scope=admin?brands:['beleza','casa','natal'];
 const result=data=>Response.json(data,{headers:{'content-range':'0-0/1'}});
 if(url.pathname==='/auth/v1/user')return result({id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{first_name:admin?'Administrador':'Karen'},app_metadata:{},created_at:'2026-11-16T03:00:00Z'});
 if(url.pathname==='/rest/v1/rpc/dropou_access_context')return result({owner:token==='fixture-disabled'?null:owner,actor:id,admin,brands:token==='fixture-disabled'?[]:scope,displayName:admin?null:'Karen'});
 if(url.pathname==='/rest/v1/operation_settings')return result(scope.map(brand_id=>({brand_id,display_name:({beleza:'Toque de Beleza',casa:'Cantinho & Charme',natal:'Clima de Natal'})[brand_id]||brand_id})));
 if(['/rest/v1/products','/rest/v1/offers'].includes(url.pathname))return result(url.searchParams.get('id')==='eq.20000000-0000-4000-8000-000000000099'?{id:'20000000-0000-4000-8000-000000000099',brand_id:'casa'}:null);
 throw Error('Unplanned fixture read '+url.pathname);
};
