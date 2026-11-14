import {operatorAudit} from '@/server/operator-audit';
﻿import {sessionDb,apiError} from '@/server/session';
import {publishTelegram} from '@/server/telegram-offer';
import {z} from 'zod';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user,actorId,operation}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const body=z.object({caption:z.string().min(1).max(4000),targetKey:z.string().length(64),confirmed:z.literal(true),mode:z.enum(['safe','verified']),sourceCaption:z.string().min(1).max(4000),mediaMode:z.enum(['photo','link_preview','text']).optional(),photoConfirmed:z.boolean().default(false),republicationKey:z.string().uuid().optional()}).parse(await request.json());
 const result=await publishTelegram(user.id,id,body.caption,body.targetKey,body.mode,body.sourceCaption,body.mediaMode?{mediaMode:body.mediaMode,photoConfirmed:body.photoConfirmed}:undefined,body.republicationKey);if(!result.sent)throw new Error('A publicação ficou retida. Confira o estado da oferta antes de enviar novamente.');await operatorAudit(user.id,actorId,operation,'Publicação Telegram enviada',id);return Response.json(result);
}catch(e){return apiError(e);}}
