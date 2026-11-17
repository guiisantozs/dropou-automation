'use client';
import {useEffect} from 'react';
import {recoveryPath} from '@/lib/password-recovery';

// Handles an older email template falling back to Site URL. Fragments never reach the server.
export default function RecoveryRedirect(){
 useEffect(()=>{const hash=window.location.hash,p=new URLSearchParams(hash.slice(1));if(window.location.pathname!==recoveryPath&&(p.get('type')==='recovery'||p.has('error_code')))window.location.replace(recoveryPath+hash);},[]);
 return null;
}
