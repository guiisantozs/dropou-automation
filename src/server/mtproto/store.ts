import type {SupabaseClient} from '@supabase/supabase-js';
import type {MtprotoChannel,MtprotoDiagnostic} from '../../lib/telegram-mtproto';
import {MtprotoFailure} from './security';

export type Scope={owner:string;brand:string};
export type ConnectionRow={id:string;owner_id:string;brand_id:string;status:'disconnected'|'code'|'password'|'connected'|'error';encrypted_state:string|null;auth_expires_at:string|null;attempts:number;next_attempt_at:string;error_code:string|null;selected:MtprotoChannel[];test_channel_id:string|null;test_started_at:string|null;test_expires_at:string|null;heartbeat_at:string|null};
export interface MtprotoStore {
 load(scope:Scope):Promise<ConnectionRow>;
 update(row:ConnectionRow,patch:Partial<ConnectionRow>):Promise<ConnectionRow>;
 clearDiagnostics(row:ConnectionRow):Promise<void>;
 record(row:ConnectionRow,message:{id:number;channelId:string;date:number;kind:MtprotoDiagnostic['kind']}):Promise<void|boolean>;
}
export function checked<T>({data,error}:{data:T;error:unknown}):T{if(error)throw new MtprotoFailure('storage');return data;}
export class DatabaseMtprotoStore implements MtprotoStore {
 constructor(private db:SupabaseClient,private holder:string){}
 async load(scope:Scope){
  const access=checked(await this.db.from('telegram_dispatch_config').select('owner_ids').eq('id',true).single());
  if(!access?.owner_ids.includes(scope.owner))throw new MtprotoFailure('revoked');
  const row=checked(await this.db.from('telegram_mtproto_connections').select('*').eq('owner_id',scope.owner).eq('brand_id',scope.brand).maybeSingle());
  if(row)return row as ConnectionRow;
  return checked(await this.db.from('telegram_mtproto_connections').insert({owner_id:scope.owner,brand_id:scope.brand}).select('*').single()) as ConnectionRow;
 }
 async update(row:ConnectionRow,patch:Partial<ConnectionRow>){const data=checked(await this.db.rpc('dropou_mtproto_update',{p_holder:this.holder,p_connection:row.id,p_patch:patch}));if(!data)throw new MtprotoFailure('storage');return data as ConnectionRow;}
 async clearDiagnostics(row:ConnectionRow){checked(await this.db.from('telegram_mtproto_diagnostics').delete().eq('connection_id',row.id));}
 async record(row:ConnectionRow,message:{id:number;channelId:string;date:number;kind:MtprotoDiagnostic['kind']}){
  return checked(await this.db.rpc('dropou_mtproto_diagnostic',{p_holder:this.holder,p_connection:row.id,p_test:row.test_started_at,p_channel:message.channelId,p_message:message.id,p_at:new Date(message.date*1000).toISOString(),p_kind:message.kind})) as boolean;
 }
}
