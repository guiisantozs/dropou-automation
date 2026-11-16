# Mercado Livre — experimento isolado de geração de links

Esta prova de conceito existe exclusivamente em experiments/mercado-livre-browser/ na branch feat/mercado-livre-browser-poc. Não modifica o Next.js, o banco Supabase, a Vercel, o dispatcher Telegram, a integração anterior nem a branch main.

## Executar na outra máquina

Abra o terminal na raiz do projeto e rode:

    git fetch origin
    git switch feat/mercado-livre-browser-poc
    cd experiments/mercado-livre-browser
    npm install
    npm test
    npm.cmd start -- "COLE_AQUI_A_URL_COMPLETA_DE_UM_PRODUTO_MERCADO_LIVRE"

Necessário: Node.js 20+ e Google Chrome instalado. A URL de produto precisa começar com https:// e pertencer ao Mercado Livre.

## Como funciona

1. O script abre o Chrome usando um perfil exclusivo guardado em .browser-profile/, dentro desta pasta. Esta pasta está ignorada pelo Git.
2. Você faz login/2FA manualmente e navega até o Gerador de Links no portal Mercado Livre. O script não controla o login e não tenta burlar CAPTCHA.
3. Quando o formulário estiver na tela, pressione Enter no terminal. O script tentará preencher o link e clicar em Gerar se identificar inequivocamente o campo e o botão.
4. Se a interface diferir, finalize os passos manualmente na mesma janela.
5. Copie o link gerado na interface e cole no terminal para validar HTTPS, domínio e compatibilidade do ID de anúncio quando visível.

O link validado é apenas um candidato; URL com aparência correta não comprova a vinculação à sua conta, etiqueta ou comissão. Verifique no painel oficial de afiliados. Links meli.la podem ocultar o ID do anúncio, então a identidade fica não confirmada.

## Proteções e limites

- Não faz importação nem publicação de produto, não grava resultados, não usa rotas privadas, não exporta cookies, tokens ou perfil para servidor e não mexe na produção.
- Nunca envie a pasta .browser-profile para GitHub, Vercel ou terceiros.
- Não há conversão totalmente automática nesta fase; a automação depende de validação da interface real da conta.
- Se houver CAPTCHA, verificação de segurança ou bloqueio de acesso, conclua pela interface oficial; não contorne proteções.
- Para desvincular o navegador de teste, faça logout nele, feche-o e apague .browser-profile.
- Não una esta branch à main até comparar com o trabalho não enviado do computador original.

O próximo passo, após um teste real, será capturar de forma robusta o resultado da UI com seletores observados, substituir o paste manual e testar a confirmação de link no programa.

## Validação pelo Chrome habitual (recomendada quando o perfil separado falha)

Entre em `experiments/mercado-livre-browser`, atualize a branch e execute **sem colocar o link na linha de comando**:

    npm.cmd run manual

O script perguntará primeiro pelo link normal do produto e depois pelo link gerado no Chrome normal, em sua conta de afiliado. Cole cada URL quando o terminal pedir. Isso evita que o Windows interprete o `&` dos parâmetros da URL como outro comando. É apenas uma validação de formato/compatibilidade, não uma prova de atribuição ou comissão.
