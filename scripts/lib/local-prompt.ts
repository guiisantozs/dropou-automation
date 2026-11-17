import {createInterface} from 'node:readline/promises';

// The operator explicitly requested visible input in the LOCAL terminal.
// Inputs are never forwarded to a shell, subprocess arguments, files or application logs.
export async function localPrompt(label:string):Promise<string>{
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Execute diretamente no terminal local interativo, sem redirecionamento.');
 const terminal=createInterface({input:process.stdin,output:process.stdout,terminal:true});
 try{return await terminal.question(label+' ');}finally{terminal.close();}
}
