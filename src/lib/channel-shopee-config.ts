import {shopeeConfigSchema,defaultShopeeConfig} from './shopee-automation';
export function channelShopeeConfig(settings:{shopee_config?:Record<string,unknown>;radar?:Record<string,unknown>}){
 const raw=settings.shopee_config||{},radar=settings.radar||{};
 const terms=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];
 return shopeeConfigSchema.parse({...raw,
  ...(Number(radar.preferredMin)>0?{minPrice:radar.preferredMin}:{}),
  ...(Number(radar.preferredMax)>0?{maxPrice:radar.preferredMax}:{}),
  ...(Number(radar.minimumReputation)>0?{minRating:radar.minimumReputation}:{}),
  ...(Number(radar.minimumDiscount)>0?{minDiscount:radar.minimumDiscount}:{}),
  avoid:[...new Set([...defaultShopeeConfig().avoid,...terms(raw.avoid),...terms(radar.avoid)])].slice(0,50),
 });
}
