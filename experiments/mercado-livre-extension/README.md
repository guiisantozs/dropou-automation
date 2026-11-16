# Dropou — Extensão experimental Mercado Livre (Chrome)

Objetivo: testar a geração de um link de afiliado pela interface do **Gerador de produtos recomendados** do Mercado Livre já autenticada no Chrome normal, sem precisar manter a página do gerador aberta manualmente. O experimento **não é integração de produção** nem prova de comissão. A primeira execução requer uma sessão válida no próprio Chrome.

## Isolamento

- Branch exclusiva: feat/mercado-livre-browser-poc.
- Pasta exclusiva: experiments/mercado-livre-extension/.
- Nenhuma alteração na interface Next.js, Supabase, Vercel, cron, captador MTProto ou envios Telegram/WhatsApp.
- Sem API privada, leitura de cookies, tokens, credenciais, armazenamento local da página, interceptação de requisições ou endpoints ocultos.
- A extensão não é publicada na Chrome Web Store; instalação local de desenvolvimento, com permissões específicas para o domínio Mercado Livre.

## Instalar no Chrome já conectado

1. No VS Code, na pasta raiz dropou-automation, execute git fetch origin e git switch feat/mercado-livre-browser-poc (se já estiver nela, basta git pull origin feat/mercado-livre-browser-poc).
2. Abra seu **Chrome habitual** (não o Chrome que o Playwright abre).
3. Visite chrome://extensions, habilite **Modo do desenvolvedor**, clique **Carregar sem compactação**.
4. Escolha a pasta completa de extensões: C:\Users\Usuario\Documents\dropou-automation\experiments\mercado-livre-extension (adapte o caminho se clonou em outro local).
5. Fixe o ícone "Dropou — Mercado Livre (experimento)" no menu de extensões.
6. Clique no ícone e cole o **link normal completo do produto** no campo. Não cole um link de afiliado existente.
7. Deixe marcada a opção de fechar a aba após a captura, se desejar. Clique **Gerar link em segundo plano**.
8. O Chrome criará uma aba **inativa** com o gerador e a extensão tentará preencher o campo com o produto e acionar **Gerar**. Clique novamente no ícone Dropou para ver o andamento.
9. Se aparecer um link candidato, copie-o. **Confirme manualmente a vinculação à sua conta/etiqueta e ao produto antes de usá-lo.** Links meli.la ocultam o ID do destino; não são tratados como comprovadamente corretos.
10. Se aparecer "Ação manual necessária", use **Ver aba de teste** para conferir a página, login, etiqueta ou alguma mudança da interface. A extensão deixa essa aba aberta, sem repetir cliques nem contornar controles. Use **Novo teste** para encerrar a aba de teste e começar outra tentativa.

## O que esperar — e o que não esperar

- "Segundo plano" aqui significa **aba criada com active:false**. Ela pode aparecer na barra de abas e **pode entrar no histórico de navegação**, além de registros da rede ou da organização. A extensão não apaga histórico, não esconde tráfego e não contorna monitoramento.
- O Chrome precisa estar aberto e a conta autenticada; o PC precisa estar ligado.
- O teste ainda **não** transforma o Dropou em serviço 24 horas e **não publica** nenhuma oferta automaticamente.
- O Chrome pode restringir páginas, exigir novo login/2FA, ou mudar o formulário. Nesses casos, a tentativa falha com aviso e é necessário acompanhar manualmente.
- O script procura um **único campo compatível** e um **único botão Gerar**; se forem ambíguos, falha sem clicar ao acaso.
- A captura considera apenas **links novos visíveis na página** que pareçam links gerados. Se o resultado só estiver disponível por um botão "Copiar" sem URL no DOM, não tentará ler a área de transferência silenciosamente; será necessário ajustar o fluxo após uma inspeção autorizada.
- A URL do produto e o candidato ficam temporariamente em chrome.storage.session (não em cookies nem em arquivos), para permitir acompanhar o andamento pelo popup. A sessão é descartada após o fechamento/reinício do navegador, e **Novo teste** limpa os dados atuais.
- Usuários de PCs da empresa devem seguir a política de extensões e uso do equipamento.

## Testes de validação de URL

Na pasta desta extensão, execute:

    node --test core.test.mjs

Esses testes verificam domínio HTTPS, URLs falsas e anúncios incompatíveis. Não testam uma conta real nem a UI oficial, que depende de um teste manual no Chrome.

## Próxima etapa

Depois de um primeiro link capturado na interface real, revisar os seletores, conferir a identidade do produto, e só então avaliar integração com as filas do Dropou. **Nunca tratar o status not_confirmed como comissão ou conversão comprovada**, nem habilitar postagem automática enquanto houver dúvida sobre a atribuição ao afiliado.

Não faça merge desta branch na main antes de conciliar as alterações não enviadas do outro computador.
