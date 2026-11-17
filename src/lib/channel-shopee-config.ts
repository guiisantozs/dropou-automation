import {shopeeConfigSchema,defaultShopeeConfig} from './shopee-automation';
import {memberCurationProfile} from './member-curation';
export function channelShopeeConfig(settings:{shopee_config?:Record<string,unknown>;radar?:Record<string,unknown>},operation='dropou'){
 const raw=settings.shopee_config||{},radar=settings.radar||{};
 const profile=memberCurationProfile(operation);
 const terms=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];
 return shopeeConfigSchema.parse({...(profile?{keywords:profile.keywords,minPrice:profile.minPrice,maxPrice:profile.maxPrice,minSales:20,minRating:4.5,minDiscount:0,minConfidence:45,minScore:55}:{}),...raw,
  ...(Number(radar.preferredMin)>0?{minPrice:radar.preferredMin}:{}),
  ...(Number(radar.preferredMax)>0?{maxPrice:radar.preferredMax}:{}),
  ...(Number(radar.minimumReputation)>0?{minRating:radar.minimumReputation}:{}),
  ...(Number(radar.minimumDiscount)>0?{minDiscount:radar.minimumDiscount}:{}),
  avoid:[...new Set([...defaultShopeeConfig().avoid.filter(term=>!profile||term!=='miniatura'),...terms(raw.avoid),...terms(radar.avoid)])].slice(0,50),
 });
}
