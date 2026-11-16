#!/usr/bin/env node
// Experimento local: somente interface visível; nunca exporta sessão.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {chromium} from 'playwright';
import {parseMercadoLivreUrl, assessGeneratedLink} from './links.mjs';

const GUIDE = 'https://www.mercadolivre.com.br/l/afiliados-gere-seus-links';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(DIR, '.browser-profile');
const usage = () => console.log('Uso: npm start -- "https://produto.mercadolivre.com.br/MLB-..."\nO Chrome instalado abre com perfil EXCLUSIVO. Login, 2FA e CAPTCHA são manuais.');

async function uniqueInput(page) {
  const candidates = page.locator('input:not([type=hidden]):not([type=password]),textarea');
  const matches = [];
  for (let i = 0, size = Math.min(await candidates.count(), 60); i < size; i++) {
    const field = candidates.nth(i);
    if (!await field.isVisible().catch(() => false)) continue;
    const attrs = await field.evaluate(e => [e.getAttribute('placeholder'),e.getAttribute('aria-label'),e.getAttribute('name'),e.id,e.getAttribute('type')].join(' '));
    if (/(link|url|endere[cç]o|produto|an[uú]ncio)/i.test(attrs)) matches.push(field);
  }
  return matches.length === 1 ? matches[0] : null;
}

async function attempt(page, productUrl) {
  const field = await uniqueInput(page);
  if (!field) {
    console.log('Campo do gerador não identificado sem ambiguidade. Cole o URL manualmente na página.');
    return;
  }
  await field.fill(productUrl);
  console.log('URL preenchida. Procurando botão inequívoco de geração...');
  const buttons = page.getByRole('button', {name:/^(gerar( meu)? link|gerar link de afiliado|criar link|gerar)$/i});
  const found = [];
  for (let i=0,size=Math.min(await buttons.count(),20);i<size;i++){
    const b=buttons.nth(i);
    if (await b.isVisible().catch(()=>false) && await b.isEnabled().catch(()=>false)) found.push(b);
  }
  if(found.length===1){
    await found[0].click({timeout:8000});
    console.log('Clique realizado. Confirme o resultado na interface.');
  } else console.log('Botão não identificado sem ambiguidade. Clique em Gerar manualmente.');
}
function report(original, candidate) {
  try {
    const result = assessGeneratedLink(original, candidate);
    console.log('\nFormato: '+result.identity);
    console.log('Candidato aceito: '+(result.accepted?'sim':'não'));
    console.log(result.message);
    if(result.accepted){
      console.log('Link candidato: '+candidate);
      console.log('Confirme na SUA conta/etiqueta do Programa de Afiliados.');
    }
    console.log('Atribuição e comissão NÃO são verificadas automaticamente.');
  } catch(err){ console.log('Resultado rejeitado: '+err.message); }
}
async function main(){
  if(process.argv.includes('--help')||process.argv.includes('-h')){usage();return;}
  const arg=process.argv.slice(2).join(' ').trim();
  if(!arg){usage();process.exitCode=1;return;}
  let source;
  try{source=parseMercadoLivreUrl(arg).href;}catch(err){console.error('URL inválida: '+err.message);process.exitCode=1;return;}
  const rl=createInterface({input:stdin,output:stdout});
  let context;
  try{
    console.log('Abrindo Chrome em perfil local separado. Não compartilhe a pasta .browser-profile.');
    try {
      context=await chromium.launchPersistentContext(PROFILE,{channel:'chrome',headless:false,viewport:null,acceptDownloads:false});
    } catch(err) {
      console.error('Chrome não abriu. Instale o Google Chrome. Detalhe: '+err.message);
      process.exitCode=1;return;
    }
    const page=context.pages()[0]||await context.newPage();
    await page.goto(GUIDE,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{
      console.log('Guia não carregou. Navegue até o Portal de Afiliados manualmente.');
    });
    console.log('\nFaça login normalmente e navegue até o Gerador de Links.');
    await rl.question('Com o campo de geração visível, pressione Enter...');
    const active=context.pages().filter(p=>!p.isClosed()).at(-1)||page;
    await attempt(active,source).catch(err=>{
      console.log('Automação parcial indisponível: '+err.message);
      console.log('Finalize pela interface, sem contornar bloqueios.');
    });
    console.log('\nConfira o link criado na página, use Copiar link e cole no terminal.');
    const generated=(await rl.question('Link GERADO (Enter cancela): ')).trim();
    if(generated) report(source,generated);
    else console.log('Encerrado sem link. Nenhum dado persistido.');
  } finally {
    if(context) await context.close().catch(()=>{});
    rl.close();
  }
}
main().catch(err=>{console.error('Falha: '+err.message);process.exitCode=1;});
