import type {Product} from './domain';
import {formatCaption} from './ai';
import {captionError} from './caption-editor';
/** A proposal only: callers must show both texts and obtain explicit approval. */
export function captionCorrection(before:string,p:Product){
 const reason=captionError(before,p);if(!reason)return null;
 const after=formatCaption({...p,previousPrice:null,previousVerified:false},p.operation||'dropou');
 if(after===before||captionError(after,p))return null;
 return {before,after,reason};
}
