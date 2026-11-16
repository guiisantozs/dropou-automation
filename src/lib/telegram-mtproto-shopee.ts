export type MtprotoCatalogMatch={status:'found'|'missing'|'error';productId?:string;name?:string;archived?:boolean};
export type MtprotoShopeeConversion={
 state:'identified'|'waiting'|'converting'|'generated'|'error';
 affiliateUrl:string|null;error:string|null;source:'api'|'cache'|null;
 product:{name:string;image:string;price:number;priceMax:number;checkedAt:string}|null;
};
export type MtprotoShopeeCandidate={
 id:string;messageId:number;kind:'text'|'photo';messageAt:string;receivedAt:string;
 state:'resolving'|'identified'|'error';canonicalUrl:string|null;shopId:string|null;itemId:string|null;
 catalog:MtprotoCatalogMatch|null;error:string|null;repeatedInTest:boolean;
 conversion?:MtprotoShopeeConversion;
};
export type MtprotoShopeeQueue={available:boolean;persistent?:boolean;items:MtprotoShopeeCandidate[];expiresAt:string|null;limitReached:boolean;error?:string};
