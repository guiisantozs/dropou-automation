import OfferWorkspace from '@/components/offer-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <OfferWorkspace id={(await params).id} edit/>;}
