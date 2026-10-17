# Agenda FGT e TickTick: ativação e operação

## Escopo

Sincronizar somente Work, Financeiro e Estudos. Pessoal, Fitness e Brainstorm ficam fora. Google Agenda permanece conectado. A integração inicia desativada: `TICKTICK_SYNC_ENABLED` só permite gravações quando vale exatamente `true`.

## Antes da publicação

1. Concluir revisão e testes. Não publicar com problemas importantes em aberto.
2. Conferir a prévia das ações e obter a autorização do Fernando para publicação e primeira sincronização, conforme Task 8 do plano aprovado.
3. Aplicar somente as alterações aditivas de `prisma/schema.prisma`, sem aceitar perda de dados. Nunca usar reset do banco.
4. Configurar `TICKTICK_ACCESS_TOKEN` pelo mecanismo de secrets da Vercel, sem imprimir o valor em comandos, relatórios ou logs. Manter `TICKTICK_SYNC_ENABLED=false` durante a preparação.
5. Publicar e verificar a Agenda, as quatro visões, a conexão Google e os fluxos existentes.
6. Executar `POST /api/agenda/sync` com `{"dryRun":true}` usando autenticação. A simulação consulta tarefas e registra a trava/estado, mas não modifica tarefas. Conferir títulos, listas e contagens com a prévia aprovada. Havendo mudança relevante, revisar antes de prosseguir.
7. Ativar a sincronização apenas dentro da autorização recebida. A abertura da Agenda, alterações em tarefas e o cron da manhã podem iniciar gravações assim que a configuração estiver ativa.
8. Conferir o resultado da primeira sincronização e repetir a simulação: nenhuma criação deve se repetir.

## Verificação funcional

Usar uma tarefa de teste claramente identificada em Work e uma em Estudos. Verificar criação nos dois sentidos, horário de São Paulo, alteração de título sem perder duração, conclusão e próxima ocorrência recorrente. Conferir que as listas pessoais não foram importadas. Não concluir nem apagar tarefas reais para testar.

## Falhas e recuperação

- **Autenticação:** renovar a conexão TickTick na ponte Jarvis e atualizar o secret na Vercel. Não registrar tokens no histórico.
- **Origem incompleta:** lista obrigatória ausente, duplicada ou resposta inválida interrompe a execução antes das alterações. Restaurar a configuração e tentar novamente.
- **Trava persistente:** não há expiração automática, para impedir dois processos gravando ao mesmo tempo. Desativar novos disparos e confirmar que todos os processos anteriores terminaram antes de limpar `runningSince` e `lockToken` no registro `TickTickSyncState` de id `main`. Nunca liberar uma trava apenas por ser antiga. Reativar somente após a confirmação e executar uma simulação.
- **Interrupção durante criação:** a API não garante criação exatamente uma vez se a resposta for perdida. Conferir os dois lados antes de recriar manualmente. A correspondência inicial usa título, lista e agendamento.
- **Retorno à versão anterior:** primeiro desativar a sincronização e aguardar processos em andamento. Preservar as colunas aditivas e os vínculos; reverter o aplicativo não desfaz alterações que já ocorreram no TickTick.

## Referências

- `docs/superpowers/specs/2026-10-16-agenda-ticktick-design.md`
- `docs/superpowers/plans/2026-10-16-agenda-ticktick.md`

Este documento descreve o procedimento. Não comprova publicação ou ativação em produção.
