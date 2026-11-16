export function workspaceAdminRequired(path:string,method:string){
 if(path==='/api/shopee/test-telegram')return true;
 if(method==='GET')return false;
 return /^\/api\/(operations|team|ai\/usage|ai\/visual\/diagnostic|integrations)(\/|$)/.test(path)
  ||path==='/api/publication-config'||(path==='/api/shopee/automation'||path==='/api/shopee/curation-config')&&method==='PATCH';
}
import {isLocalOperation} from './workspace-brands';
export function operationIntegrationUnavailable(operation:string,path:string,method:string){return isLocalOperation(operation)&&(
 /^\/api\/(shopee|integrations|discovery)(\/|$)/.test(path)||/^\/api\/products\/(lookup|mercado-livre)(\/|$)/.test(path)||
 method!=='GET'&&(/\/offers\/[0-9a-f-]+\/(telegram|schedule|channels|publish)$/.test(path)||path==='/api/publication-config')
);}
