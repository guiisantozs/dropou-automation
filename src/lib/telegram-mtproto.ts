import {z} from 'zod';
import type {MtprotoShopeeQueue} from './telegram-mtproto-shopee';

export const mtprotoCommand = z.discriminatedUnion('action', [
 z.object({action:z.literal('login'),phone:z.string().regex(/^\+[1-9]\d{7,14}$/),consent:z.literal(true)}).strict(),
 z.object({action:z.literal('code'),code:z.string().regex(/^\d{4,8}$/)}).strict(),
 z.object({action:z.literal('password'),password:z.string().min(1).max(256)}).strict(),
 z.object({action:z.literal('channels'),more:z.boolean().optional()}).strict(),
 z.object({action:z.literal('select'),ids:z.array(z.string().regex(/^\d{1,20}$/)).max(10)}).strict(),
 z.object({action:z.literal('test'),channelId:z.string().regex(/^\d{1,20}$/),controlled:z.literal(true)}).strict(),
 z.object({action:z.literal('stop')}).strict(),
 z.object({action:z.literal('offers')}).strict(),
 z.object({action:z.literal('disconnect')}).strict(),
]);
export type MtprotoCommand=z.infer<typeof mtprotoCommand>;
export type MtprotoChannel={id:string;title:string;controlled:boolean};
export type MtprotoDiagnostic={message_id:number;channel_id:string;received_at:string;message_at:string;kind:'text'|'photo'|'document'|'other'};
export type MtprotoStatus={configured:boolean;workerOnline:boolean;status:'connected'|'disconnected'|'error';step:'code'|'password'|null;error:string|null;selected:MtprotoChannel[];test:{channelId:string;startedAt:string;expiresAt:string}|null;diagnostics:MtprotoDiagnostic[];serverNow:string;shopee?:MtprotoShopeeQueue};
export const mtprotoErrors:Record<string,string>={
 diagnostic_only:'O worker está em diagnóstico local. Login e banco estão desabilitados até configurar o ambiente completo.',
 input:'Dados da conexão inválidos ou muito grandes. Confira os campos e o consentimento.',
 provider:'O Telegram não confirmou a operação. Atualize o estado antes de tentar novamente.',
 unavailable:'Worker indisponível. Confira a hospedagem e atualize o estado antes de repetir.',
 expired:'O login expirou. Solicite um novo código.',
 code:'Código inválido. Confira o código recebido no aplicativo Telegram.',
 password:'Senha de verificação em duas etapas inválida.',
 flood:'O Telegram limitou as tentativas. Aguarde o prazo indicado pelo servidor.',
 revoked:'A autorização foi revogada ou expirou. Conecte novamente.',
 vault:'Não foi possível abrir a sessão criptografada. Confira a chave do worker.',
 storage:'Não foi possível confirmar a gravação no servidor. Atualize o estado.',
 busy:'Há uma operação em andamento. Aguarde e atualize o estado.',
 source:'Selecione um canal administrado por esta conta e confirme que é uma fonte controlada.',
 attempts:'Limite de tentativas deste login atingido. Aguarde e inicie outro login.',
 logout:'Sessão removida do Dropou. O Telegram não confirmou a revogação; encerre a sessão Dropou em Configurações → Dispositivos no aplicativo oficial.',
 reconnect:'Desconecte a sessão anterior antes de solicitar um novo código. Isso evita deixar uma autorização antiga ativa no Telegram.',
};
