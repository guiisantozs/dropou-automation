# Dashboard, catálogo e correções do Dropou

Implementação de 06/11/2026. Foco em Dropou Games & Tecnologia e Mercado Livre. Supabase, OpenAI, OCR, cache, limites financeiros, publicação manual no WhatsApp, Telegram e filas existentes foram mantidos. A Central Multimarcas não foi implementada; adaptadores e dados das integrações anteriores continuam preservados.

## Diagnóstico da leitura visual

O banco remoto confirmou `ai_budget.enabled=false`, limites 4,50/0,50/100 e zero chamadas em `ai_requests`. Esse bloqueio explica a mensagem “Leitura visual paga desativada. Usando OCR local gratuito”. A implantação anterior já havia configurado as flags de produção e a allowlist. Nenhuma chave foi exportada, e nenhuma geração paga foi executada para diagnosticar.

GET `/api/ai/visual` agora combina configuração do servidor e situação do orçamento. O cadastro mostra o motivo do bloqueio e as verificações de chave, flags, backend Supabase, orçamento, limites e pausa de taxa. Sessão e allowlist continuam obrigatórias antes de revelar o diagnóstico. O GET consulta somente o banco, sem OpenAI.

O botão **Verificar acesso ao modelo (sem gerar)** usa POST autenticado em `/api/ai/visual/diagnostic`, que executa somente GET `/v1/models/{model}` no provedor. Não usa Responses, imagens, prompt ou tokens de geração. Erros retornam mensagens controladas, sem refletir credenciais ou erros brutos. Uma consulta de metadados não comprova saldo, capacidade de gerar nem qualidade visual; esses pontos continuam dependendo do único teste visual autorizado e de um print real. O ambiente não ofereceu sessão autenticada de navegador para executar essa consulta em produção.

Para autorizar o uso por clique, abrir **Consumo de IA**, revisar os limites e marcar **Autorizar geração paga por clique**, salvando os limites. Isso não faz geração. Para o único teste já autorizado, limitar a uma requisição diária e desativar o orçamento ao concluir; repetir exatamente o mesmo print para verificar cache. Não foi ativado consumo pago geral por esta alteração.

Os estados distinguem **Visão OpenAI**, **cache de IA**, **OCR gratuito**, **template gratuito** e **IA indisponível**. Cada geração visual continua usando uma única requisição para dados e chamada criativa. Editar, navegar, carregar o dashboard, copiar, salvar e publicar não chamam a OpenAI. Consultar os metadados do modelo exige o clique separado descrito acima.

## OCR e dados comerciais

Textos de navegação como “Conferir mais produtos da marca AMD”, botões, relacionados e comissões deixam de ser candidatos a título. O OCR prioriza termos de produto e mantém título completo e resumo. Exemplo de resumo determinístico: “Processador AMD Ryzen 3 3200G”. A instrução visual também exclui navegação explicitamente. O prompt/cache foi versionado para não reutilizar resultados do extrator antigo.

O extrator visual mantém marca, modelo e variante; acrescenta preço Pix separado quando visível, sem trocar o preço principal automaticamente. Ambiguidades de produto, preço e variante continuam pendentes. Preço anterior e desconto dependem de evidência. Economia continua calculada em centavos por código.

Parcelamento passa por parser estrito e vira `{count, amount, interestFree}`. O formulário apresenta quantidade, valor por parcela e confirmação de juros. O campo textual legado continua disponível para compatibilidade, mas a publicação só utiliza a condição validada e reformatada. O ruído **“5 MV 8x R$ 55,88 sem juros”** é rejeitado e omitido, mesmo que um registro antigo marque a string como verificada. “Sem juros” só é acrescentado quando comprovado.

A conferência humana registra o momento do clique; salvar mais tarde não renova esse horário. Depois de 15 minutos, é necessária nova conferência. A captura não comprova preço atual ou disponibilidade. Pix, condições, estoque, dados de screenshot e snapshots continuam protegidos pelas validações existentes.

## Editor e publicação

**Editar legenda** permite alterar texto, título, emojis, características, espaçamento e quebras. Há edição na etapa Oferta e na tela de publicação, salvamento sem IA e restauração da versão original. Reabrir ou deixar o preço vencer não apaga a edição; a expiração bloqueia compartilhar/publicar.

`offers.original_caption` preserva a primeira versão e `manually_edited` identifica edição manual. O novo RPC `dropou_save_offer_version` usa SECURITY INVOKER, autenticação, RLS, locks e a transação do RPC existente. A versão anterior das funções permanece para compatibilidade. Um rascunho pode guardar a edição após expirar; publicação continua exigindo os dados atuais e o snapshot correspondente.

Salvar uma legenda escolhida valida `#publi`, link de afiliado original, valores monetários comprovados, percentual calculado, Pix e parcelamento. Revalidar um produto com preço diferente exige corrigir os valores da edição, sem sobrescrevê-la silenciosamente. Rotas de publicação manual, agendamento e Telegram também validam a legenda salva. Essas validações não verificam a veracidade de texto livre sobre características inseridas pelo administrador.

`CaptionContent` renderiza negrito, tachado, linhas, emojis e links sem usar HTML arbitrário. Preview e Telegram compartilham `telegramText`, incluindo offsets UTF-16 e preservação do link. O WhatsApp recebe o texto com sua marcação nativa. O usuário continua responsável por postar no WhatsApp; Telegram só envia pelo botão explícito. Não houve envio real durante a validação.

## Dashboard e fluxo

- Cabeçalho com saudação por horário e ação principal **Criar nova oferta**.
- Resumos reais de produtos, publicações, agendamentos e pendências de conferência; nenhuma métrica demonstrativa.
- Bloco compacto de criação por link e print.
- Catálogo em lista ou cards, sem tabela larga; busca, marketplace, categoria, status e data do cadastro no fuso de São Paulo. Importação CSV como ação secundária.
- Miniaturas existentes/autorizadas e ícones de processador, controle, monitor, jogo, headset, ferramenta, teclado e celular.
- Painel de detalhes com foto, nome completo, metadados, preço, validade, link original, legenda salva e histórico de preços/publicações.
- Cadastro em **Produto → Oferta → Publicação**. Imagens permanecem em memória entre etapas; o listener de colagem só fica ativo na etapa Produto. Campos avançados recolhidos.
- Preview após salvar reúne preparação para WhatsApp, envio Telegram e agendamento, mantendo a revisão humana.
- Skeleton, estados vazios, feedback de cópia/salvamento, foco visível, Escape, contenção e retorno de foco em diálogos; transições curtas e `prefers-reduced-motion`.

Tokens centrais em `src/app/workspace.css`: `--primary`, `--primary-hover`, `--primary-ink`, `--primary-soft`, `--primary-border` e `--focus`. Ações principais usam a família de tokens, permitindo trocar o destaque para azul sem editar os componentes. Estilos antigos das integrações permanecem compatíveis.

## Miniaturas privadas

Na etapa Produto, selecionar/recortar a foto, abrir **Miniatura do catálogo**, autorizar explicitamente e clicar em **Usar recorte como miniatura**. O canvas cria WebP 256×256 com proporção preservada, limite de 200 KB. O backend verifica formato e dimensões, consentimento e proprietário antes de guardar no bucket privado. Somente URLs assinadas por cinco minutos são disponibilizadas. Não há busca de imagem aleatória.

A miniatura (`thumbnailPath`) é independente do recorte de publicação (`imagePath`). É possível substituir ou excluir; consentimento é reiniciado quando a seleção/recorte muda. Exclusões dependentes de agendamento/envio continuam bloqueadas. Substituir associa um novo arquivo, sem remover automaticamente arquivos anteriores que possam fazer parte do histórico. O armazenamento da região para publicação também exige autorização explícita; sem recorte essa região pode abranger a imagem inteira, como informado na interface. Prints usados apenas para leitura não são guardados.

## Banco e instalação

Migração aplicada no Supabase existente: `supabase/migrations/20261106132921_offer_editor_and_thumbnails.sql`. Acrescenta somente as duas colunas, a função do editor e o MIME WebP no bucket já privado. Em banco novo, aplicar depois de `schema.sql`, `whatsapp-flow.sql`, `ai-economy.sql`, `telegram-offers.sql`, `offer-images.sql` e `ai-visual.sql`. Não reaplicar o schema inicial no projeto existente.

Verificação remota: função SECURITY INVOKER; `anon` sem EXECUTE; `authenticated` com EXECUTE sujeito à propriedade/RLS; bucket privado com JPEG/WebP; orçamento preservado/desativado e zero chamadas. Nenhuma nova advertência WARN nos advisors. As advertências antigas das duas funções Telegram SECURITY DEFINER e da proteção de senhas vazadas permanecem registradas em [ia-economica.md](ia-economica.md).

## Evidências e limites

86 testes aprovados, TypeScript e build de produção aprovados. Cobertura inclui o erro específico do parcelamento, navegação confundida com título, preço/centavos, editor/original persistidos com RLS, expiração, prévia segura/formatada, fotos/ícones, WebP/dimensões, metadados do modelo simulados, skeleton, troca lista/cards e três etapas. Regressões de cache, orçamento, OAuth, Telegram, WhatsApp e filas antigas também aprovadas com a migração nova.

Os testes usam DOM/jsdom e PostgreSQL embarcado. Não houve navegador conectado, portanto aparência final em desktop/notebook/tablet/celular, codecs/canvas reais, Ctrl+V físico e qualidade de leitura de um print real continuam sem QA visual prático. Breakpoints e comportamento no DOM foram verificados; não são apresentados como screenshots ou testes em dispositivos reais. Nenhuma chamada paga, publicação Telegram ou publicação WhatsApp real foi feita.

Referências: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [consulta de metadados do modelo](https://developers.openai.com/api/reference/resources/models/methods/retrieve), [upload privado no Supabase](https://supabase.com/docs/reference/javascript/storage-from-upload), [URLs assinadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).
