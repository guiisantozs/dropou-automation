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

## Atualização 0.2 — botão Ativar / Desligar (16/11/2026)

- A extensão **começa desligada** em uma nova sessão do navegador. Para testar, abra o ícone Dropou e clique **Ativar**; depois cole o link e clique Gerar.
- Ao clicar **Desligar**, o worker bloqueia novos testes, fecha a aba que a extensão abriu para o gerador e apaga o trabalho temporário do `chrome.storage.session`. O campo do produto no popup também é limpo. O script da página confere o estado antes de preencher/clicar e durante a espera do resultado.
- O botão é um interruptor **local**, e não ativa/desativa o captador Telegram ou qualquer serviço do Dropou. Não há ponte com o backend nesta versão.
- Para atualizar uma instalação existente: execute `git pull origin feat/mercado-livre-browser-poc` no repositório (pode ser de qualquer subpasta dele); abra `chrome://extensions` no Chrome e clique no ícone **Atualizar/Recarregar** da extensão Dropou. Confirme que o cartão mostra a versão **0.2.0**.
- Se apenas clicar no interruptor geral de extensões do Chrome durante um teste, o navegador pode deixar a aba aberta. Prefira clicar em **Desligar** dentro do painel Dropou antes de sair.
- O botão **não apaga o histórico**, downloads, cache do Chrome ou registros da rede/empresa, e não garante invisibilidade. Para não usar o computador do trabalho, mantenha a extensão desligada nele e utilize seu dispositivo pessoal autorizado.
- Validação disponível até agora: teste manual da versão anterior 0.1.0 capturou um link candidato. A versão 0.2.0 com interruptor precisa ser testada no Chrome real; não considerar o desligamento validado até verificar.
- Contrato proposto para o espelhamento futuro: consulte `INTEGRACAO-FUTURA.md`. Ainda não existe integração com filas, Telegram ou postagem.


## Versão 0.3.0 — testes em lote isolados (16/11/2026)

A versão 0.3.0 foi acrescentada **somente nesta branch**, sem modificar o projeto Next.js nem qualquer configuração Telegram/Supabase.

### Testar a fila

1. Atualize com git pull origin feat/mercado-livre-browser-poc e recarregue a extensão em chrome://extensions. Confira a versão 0.3.0.
2. Clique **Ativar** no popup.
3. Cole de 1 a 5 **links normais** de produtos Mercado Livre, **um por linha**. Os links precisam ser HTTPS válidos; duplicatas do mesmo anúncio serão ignoradas.
4. Clique **Iniciar conversões em segundo plano**.
5. A extensão tenta gerar **um link por vez** em uma aba inativa do Chrome. Após capturar um link candidato, registra-o apenas na sessão temporária e passa ao próximo, fechando a aba do item anterior. A opção de manter aba aberta só se aplica ao teste individual.
6. Clique no ícone Dropou para ver cada item em **aguardando / convertendo / candidato / revisão necessária**.
7. Se algum item falhar, a fila **pausa**. Confira a aba do gerador e use **Pular e continuar** se quiser seguir sem convertê-lo. Não há tentativas automáticas para erros incertos.
8. Clique **Desligar** para abortar o restante, fechar a aba criada pelo Dropou e apagar os dados temporários da fila. Ao reativar, não deve haver resultado anterior.

### Limites

- No máximo cinco URLs por lote; não trunca automaticamente acima de cinco. Não há agendamento automático ou integração remota.
- Um link meli.la capturado é um **candidato**, não um link cuja atribuição/comissão foi comprovada. **Não publicar automaticamente.**
- Links, estados e mensagens da fila ficam em chrome.storage.session até clicar Desligar, clicar Novo teste ou reiniciar o navegador. Não existe arquivo de histórico próprio nem envio desses dados ao Dropou remoto.
- Essa limpeza não impede que o Chrome, o sistema operacional, a rede ou a empresa registrem as páginas visitadas. A extensão não esconde a atividade nem apaga histórico de navegação.
- O teste da versão anterior foi observado no Chrome, mas a **versão 0.3.0 não foi testada em um navegador real nesta entrega**. Rodar testes e conferir resultados no Chrome antes de considerar concluído.

### Testes locais

Na pasta experiments/mercado-livre-extension:

    npm.cmd test

O comando executa testes de validação de URL, deduplicação/limite do lote e um Chrome simulado para verificar fila, pausa e desligamento. Não exige instalar dependências nem testar a conta real.

### Ligação futura

Consulte INTEGRACAO-FUTURA.md. O código MTProto está em outra máquina; a fila atual **não consulta Telegram e não publica mensagens**.
