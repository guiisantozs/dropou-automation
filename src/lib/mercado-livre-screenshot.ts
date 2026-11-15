import {parseScreenshot} from './ocr';
import type {OcrFields} from './ocr';
export type ScreenshotCondition='novo'|'usado'|'recondicionado';
export function parseMercadoLivreScreenshot(text:string,confidence:number):OcrFields&{brand?:string;model?:string;selectedVariant?:string;condition?:ScreenshotCondition}{
 const fields=parseScreenshot(text,confidence),all=text.split(/\r?\n/).map(v=>v.trim()),related=all.findIndex(l=>/^(produtos? relacionados?|recomenda(dos?|ções)|você também|voce tambem|compre junto|outros vendedores|quem viu)/i.test(l)),lines=related>=0?all.slice(0,related):all,label=(pattern:RegExp)=>lines.map(line=>line.match(pattern)?.[1]?.trim()).find(Boolean);
 const conditionText=label(/^(?:condi[çc][aã]o\s*:\s*)?(novo|usado|recondicionado)(?:\s*[|·]|\s*$)/i)?.toLocaleLowerCase('pt-BR') as ScreenshotCondition|undefined;
 const variants=lines.filter(line=>/^(?:cor|armazenamento|mem[oó]ria interna|tamanho|capacidade)\s*:\s*\S/i.test(line)).join(' · ').slice(0,100);
 return {...fields,brand:label(/^marca\s*:\s*(.{1,80})$/i),model:label(/^modelo\s*:\s*(.{1,100})$/i),selectedVariant:variants||undefined,condition:conditionText};
}
