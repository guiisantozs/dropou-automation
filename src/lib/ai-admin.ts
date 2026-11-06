export function assertAIAdmin(id:string,allowed=process.env.AI_ADMIN_USER_IDS||''){
 if(!allowed.split(',').map(s=>s.trim()).filter(Boolean).includes(id))throw new Error('FORBIDDEN: Acesso à IA restrito a administradores.');
}
