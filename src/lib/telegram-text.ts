export function telegramText(input:string){
 let text='',cursor=0;const entities:{type:'bold'|'strikethrough'|'url';offset:number;length:number}[]=[];
 for(const match of input.matchAll(/([*~])([^*~\n]+)\1/g)){
  text+=input.slice(cursor,match.index);const insideUrl=/https?:\/\/\S*$/i.test(input.slice(0,match.index))||/https?:\/\//i.test(match[2]);
  if(insideUrl)text+=match[0];else{entities.push({type:match[1]==='*'?'bold':'strikethrough',offset:text.length,length:match[2].length});text+=match[2];}
  cursor=match.index+match[0].length;
 }
 text+=input.slice(cursor);
 for(const match of text.matchAll(/https?:\/\/[^\s<>]+/g))entities.push({type:'url',offset:match.index,length:match[0].length});
 entities.sort((a,b)=>a.offset-b.offset);
 return {text,entities};
}
