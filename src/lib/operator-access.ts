export function workspaceAdminRequired(path:string,method:string){
 if(path==='/api/shopee/test-telegram')return true;
 if(method==='GET')return false;
 return /^\/api\/(operations|team|ai\/usage|ai\/visual\/diagnostic|integrations)(\/|$)/.test(path)
  ||path==='/api/publication-config'||path==='/api/shopee/automation'&&method==='PATCH';
}
