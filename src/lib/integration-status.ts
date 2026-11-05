export type Check={state:'connected'|'pending'|'available'|'unavailable'|'error';message:string;checkedAt:string|null;httpStatus?:number;code?:string};
export type MarketplaceChecks={oauth:Check;search:Check;account?:{id:string;nickname:string}};
export type IntegrationStatus={supabase:Check;mercadoLivre:MarketplaceChecks;shopee:Check;telegram:Check;configuration:Record<string,boolean>;redirectUri:string|null};
