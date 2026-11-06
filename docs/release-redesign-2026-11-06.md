# Release: redesign e conferência opcional

O usuário aprovou o visual e autorizou expressamente incluir a conferência opcional e a atualização do Supabase em 6 de novembro de 2026.

## Conteúdo

- Sidebar em duas camadas, banner azul com mascote em SVG, indicadores reais, produtos recentes e coluna de acompanhamento.
- Operações futuras apenas informativas, com estados de preparação.
- Atualização imediata após conferir o produto e proteção contra respostas antigas na tela.
- Alternativa local sem valores, sem alegações de estoque e sem geração paga quando não há conferência atual.
- Publicação explícita no Telegram, preparação manual do WhatsApp e alternativa sem valores nos novos agendamentos que a autorizarem.

## Banco aplicado

Projeto Dropou: `wqpdyfipjsnyzxktacqh`.

Migração: `20261106191236_optional_price_publication`, aplicada com sucesso pelo conector Supabase. Fonte: [optional-price-publication.sql](../supabase/optional-price-publication.sql).

Verificação posterior por consultas sem mutação:

- Versão sem valores aceita sem conferência; versão promocional recusada sem conferência.
- Funções de fila, reserva e adaptação acessíveis apenas ao backend; registro manual autenticado com RLS.
- RLS continua habilitada em `publications`, `deliveries` e `telegram_jobs`; as funções continuam com `security invoker`.
- Automação permanece pausada, sem envios ativos durante a implantação. Nenhum cron ou destino foi alterado.
- O relatório de segurança manteve os mesmos avisos anteriores: tabelas exclusivamente de backend com RLS sem políticas e [proteção contra senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). A configuração de autenticação não foi alterada por esta entrega. As tabelas de backend permanecem inacessíveis aos clientes conforme as permissões existentes.

## Validação do código

109 testes passaram; TypeScript, build de produção e `git diff --check` passaram. Não foram adicionadas dependências. `.env.local` e chaves não fazem parte do commit.

A prévia offline permanece em [review/redesign.html](review/redesign.html). A ausência de navegador conectado impediu screenshots e QA visual real nesta sessão.

## Publicação

Branch de destino autorizado: `main`, em `guiisantozs/dropou-automation`.

Projeto Vercel existente: `dropou-automation`. Domínio de produção: [dropou-automation.vercel.app](https://dropou-automation.vercel.app).

O procedimento de release envia o commit, acompanha o build e verifica a disponibilidade da versão publicada. Não realiza chamadas pagas, publicações de teste ou ativação da automação. A confirmação final do deployment é informada ao usuário após o estado `Ready`.
