#!/usr/bin/env node
// Prova manual: navegador habitual, sem acessar sessão/cookies e sem passar URLs pelo shell.
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {parseMercadoLivreUrl, assessGeneratedLink} from './links.mjs';

const rl=createInterface({input:stdin,output:stdout});
try {
  console.log('Dropou — teste de link de afiliado do Mercado Livre');
  console.log('Use seu Chrome NORMAL, já conectado ao programa de afiliados.');
  console.log('Cole os URLs somente nos campos abaixo, não no comando npm (evita problemas com & no Windows).');
  const raw=(await rl.question('\nCole o link NORMAL do produto: ')).trim();
  if (!raw) {
    console.log('Cancelado. Nada foi armazenado.');
  } else {
    let original;
    try { original=parseMercadoLivreUrl(raw).href; }
    catch (err) {
      console.error('Produto inválido: '+err.message);
      process.exitCode=1;
    }
    if (original) {
      console.log('\nAbra no Chrome o gerador de links oficial:');
      console.log('https://www.mercadolivre.com.br/l/afiliados-gere-seus-links');
      console.log('Cole lá o link normal, gere com a sua conta e copie o resultado.');
      const candidate=(await rl.question('\nCole o link GERADO pelo Mercado Livre: ')).trim();
      if (!candidate) {
        console.log('Cancelado. Nada foi armazenado.');
      } else {
        try {
          const result=assessGeneratedLink(original,candidate);
          console.log('\nIdentidade do anúncio: '+result.identity);
          console.log('Formato candidato aceito: '+(result.accepted?'sim':'não'));
          console.log(result.message);
          if (result.accepted) {
            console.log('Link candidato: '+candidate);
            console.log('Confirme que a sua conta e etiqueta foram usadas no painel oficial.');
          } else process.exitCode=1;
          console.log('Atribuição/comissão NÃO são comprovadas por esta validação.');
        } catch(err) {
          console.error('Link gerado inválido: '+err.message);
          process.exitCode=1;
        }
      }
    }
  }
} finally {
  rl.close();
}
