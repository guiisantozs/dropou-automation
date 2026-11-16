#!/usr/bin/env node
// Modo manual seguro: valida o link gerado no Chrome habitual, sem acessar sessões.
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {parseMercadoLivreUrl,assessGeneratedLink} from './links.mjs';

const original=process.argv.slice(2).join(' ').trim();
if(!original) {
  console.log('Uso: npm.cmd run manual -- "URL_NORMAL_DO_PRODUTO"');
  process.exitCode=1;
} else {
  let input;
  try {input=parseMercadoLivreUrl(original).href;}
  catch(err) {console.error('Produto inválido: '+err.message);process.exitCode=1;}
  if(input) {
    const rl=createInterface({input:stdin,output:stdout});
    try {
      console.log('Use seu Chrome NORMAL, já conectado ao Mercado Livre.');
      console.log('Acesse o portal oficial: https://www.mercadolivre.com.br/l/afiliados-gere-seus-links');
      console.log('Abra o Gerador de Links, cole esta URL do produto e gere um link com sua própria conta.');
      console.log('Produto: '+input);
      const link=(await rl.question('Cole o link GERADO aqui (Enter cancela): ')).trim();
      if(link) {
        try {
          const assessment=assessGeneratedLink(input,link);
          console.log('Destino: '+assessment.identity);
          console.log('Candidato aceito: '+(assessment.accepted?'sim':'não'));
          console.log(assessment.message);
          if(assessment.accepted) {
            console.log('Link candidato: '+link);
            console.log('Confirme a origem/etiqueta e atribuição no seu painel oficial.');
          }
          console.log('Esta verificação de formato NÃO comprova comissão de afiliado.');
        }catch(err){console.error('Link inválido: '+err.message);process.exitCode=1;}
      } else console.log('Cancelado. Nenhum link foi armazenado.');
    } finally {rl.close();}
  }
}
