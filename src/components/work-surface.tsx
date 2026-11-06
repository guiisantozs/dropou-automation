'use client';
import Dialog from './dialog';
export default function WorkSurface({children,labelledBy,className='',page=false}:{children:React.ReactNode;labelledBy:string;className?:string;page?:boolean}){
 return page?<section className={'offer-work-surface '+className} aria-labelledby={labelledBy}>{children}</section>:<Dialog labelledBy={labelledBy} className={className}>{children}</Dialog>;
}
