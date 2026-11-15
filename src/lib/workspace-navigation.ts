/** Only workspace locations can be used as a return destination. */
export function workspaceReturn(value:string|null|undefined):string|undefined {
 if(!value||value.length>2048||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20]/.test(value))return;
 try{const url=new URL(value,'https://workspace.local');if(url.origin!=='https://workspace.local'||!['/','/buscar-ofertas'].includes(url.pathname))return;return url.pathname+url.search;}catch{return;}
}
export function offerLocation(id:string,brand:string,intent='preview',origin?:string){
 const params=new URLSearchParams({brand}),back=workspaceReturn(origin);
 if(back)params.set('returnTo',back);
 if(['schedule','telegram'].includes(intent))params.set('action',intent);
 return '/ofertas/'+encodeURIComponent(id)+(intent==='edit'?'/editar':'')+'?'+params;
}
export function currentWorkspace(){return typeof window==='undefined'?undefined:workspaceReturn(window.location.pathname+window.location.search);}
export function rememberWorkspaceScroll(){
 if(typeof window==='undefined')return;
 const origin=currentWorkspace();if(!origin)return;
 try{window.sessionStorage.setItem('dropou.scroll:'+origin,JSON.stringify({y:window.scrollY,at:Date.now()}));}catch{/* Storage can be disabled. */}
}
