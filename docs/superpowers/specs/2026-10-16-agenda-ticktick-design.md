# Agenda FGT — TickTick sincronizado + visões do app

**Data:** 2026-10-16
**Status:** desenho aprovado em conversa, aguardando revisão desta spec

---

## Contexto

O Fernando organiza o dia no TickTick (app do iPhone) e gosta muito das visões dele. A aba
`/agenda` do Sistema FGT hoje só mostra o Google Agenda (calendário do mês, criar/apagar
evento), num arquivo de 520 linhas. As tarefas de negócio do sistema (`TodoTask`) vivem na aba
`/tarefas` e são criadas por vários caminhos (painel, Telegram/Jarvis, WhatsApp, automações do
financeiro). Resultado: duas agendas separadas.

Objetivo: **uma Agenda só no sistema**, com as visões do TickTick, em que sistema e TickTick
**conversam sozinhos** — o que entra num aparece no outro.

## Decisões tomadas na conversa

| Tema | Decisão |
|---|---|
| Sincronização | **Nos dois sentidos**, automática. Sistema é a central; TickTick é espelho. |
| Listas do TickTick que sincronizam | **💼 Work, 💰 Financeiro (só FGT), 📚 Estudos**. |
| Listas que ficam só no TickTick | 🏠 Pessoal, 🏃 Fitness, 🧠 Brainstorm. |
| Captura rápida | Lista **🧠 Brainstorm** (criada em 2026-10-16) é a lista padrão do app. Não sincroniza; ao mover para Work/Financeiro/Estudos, a tarefa entra no sistema. |
| Google Agenda | **Continua** na Agenda (eventos com horário), como hoje. |
| Visões | Hoje + atrasadas · Próximos 7 dias · Calendário (mês/semana) · Matriz de Eisenhower. |
| Ações | Ver, concluir, criar e editar. |
| Lista 👋 Bem-vindo | Apagada (era tutorial do app). |

## Fora de escopo

- Hábitos, foco/pomodoro, contagens, tags e pastas do TickTick (a API oficial não expõe).
- Caixa de Entrada nativa do TickTick (API não lista) — substituída pelo 🧠 Brainstorm.
- Arrastar e soltar no calendário, subtarefas sincronizadas, lembretes — Plano B.
- Mudanças na aba `/tarefas` além do necessário para a sincronização.

---

## Parte 1 — Modelo de dados

`TodoTask` ganha (todos opcionais, migração aditiva via `db push`):

```prisma
  tickTickId        String?   @unique
  tickTickProjectId String?
  tickTickEtag      String?
  tickTickModified  DateTime? // modifiedTime do TickTick na última sincronização
  syncedAt          DateTime? // quando o sistema e o TickTick estavam iguais pela última vez
  allDay            Boolean   @default(true)
  isRecurring       Boolean   @default(false)
  listName          String?   // "Work" | "Financeiro" | "Estudos"
```

Modelo novo `TickTickSyncState` (uma linha): `lastRunAt`, `lastOkAt`, `lastError`,
`authBroken Boolean` — usado pela tela para mostrar "sincronizado há X min" ou
"reconectar TickTick".

## Parte 2 — Mapeamentos

- **Prioridade.** TickTick usa 0/1/3/5. Sistema usa `alta|media|baixa` (e, em caminhos
  antigos, `high|medium|low`). Mapa: 5↔alta, 3↔media, 1↔baixa, 0↔`nenhuma`
  (`nenhuma` é valor novo; leitura trata `high/medium/low` como `alta/media/baixa`).
- **Lista.** TickTick → sistema: o nome da lista (sem emoji) vira `listName`. Sistema →
  TickTick: tarefa nova sem lista vai para **Financeiro** se `type = "financial"`, senão **Work**.
  Lista escolhida explicitamente no formulário prevalece.
- **Datas.** `dueDate` + `isAllDay` do TickTick ↔ `dueDate` + `allDay` do sistema, sempre em
  `America/Sao_Paulo` (o bug de fuso já apareceu duas vezes na ponte do Jarvis — reutilizar a
  mesma regra: dia inteiro = 00:00 de Brasília = 03:00 UTC).
- **Status.** TickTick `status 2` = concluída ↔ sistema `done`. `cancelled` no sistema →
  apaga no TickTick. `waiting` no sistema → continua aberta no TickTick.
- **Matriz de Eisenhower** (igual ao padrão do TickTick): alta = Urgente e importante; média =
  Importante, não urgente; baixa = Urgente, não importante; nenhuma = Nem urgente nem importante.

## Parte 3 — Sincronização

**Planejador puro** (`syncPlan`) recebe: tarefas locais ligadas/sincronizáveis, tarefas abertas
das 3 listas no TickTick, e devolve ações. **Executor** aplica as ações (rede + banco).

Regras:

1. **TickTick → sistema, nova:** tarefa aberta numa lista sincronizada sem par local → cria
   `TodoTask` (`source: "ticktick"`), ligada.
2. **Sistema → TickTick, nova:** `TodoTask` pendente/esperando sem `tickTickId` → cria no TickTick,
   guarda id/etag.
3. **Mudou dos dois lados desde `syncedAt`:** vence a alteração mais recente
   (`updatedAt` local × `modifiedTime` remoto). Só um lado mudou → copia para o outro.
4. **Ligada e sumiu das abertas do TickTick:** consulta a tarefa. Concluída → marca `done` local.
   Não encontrada (apagada ou movida para lista não sincronizada) → desliga e marca `cancelled`
   local, com nota.
5. **Concluída no sistema:** conclui no TickTick. **Recorrente:** depois de concluir, puxa de novo —
   o TickTick avança a data e a tarefa local volta a `pending` com a nova data.
6. **Apagada no sistema** (rota `DELETE /api/tarefas/[id]`): apaga no TickTick antes de apagar local.
7. **Primeira sincronização:** tarefa local pendente sem id cujo título normalizado + data batem
   com uma remota → liga em vez de duplicar.

**Quando roda:** ao abrir a Agenda; depois de cada criar/editar/concluir feito pela Agenda ou
pela aba Tarefas; no cron diário da manhã do Jarvis (07h). Sem cron de minuto (não depende do
plano da Vercel). Uma trava no banco evita duas sincronizações ao mesmo tempo.

**Falhas:** token inválido/expirado (401) → `authBroken = true`, a Agenda mostra
"Reconectar TickTick" e continua mostrando o que já está no banco; nada se perde. Outras falhas
de rede → registra em `lastError`, tenta de novo na próxima vez.

**Token:** o mesmo token OAuth da ponte do Jarvis, em `TICKTICK_ACCESS_TOKEN` na Vercel. Sem
refresh automático (a TickTick não documenta refresh_token); reconectar = rodar o
`ticktick-auth-setup.js` da ponte e atualizar a variável.

## Parte 4 — Tela `/agenda`

Abas no topo: **Hoje · 7 dias · Calendário · Matriz**. Indicador de sincronização no canto
("sincronizado há 2 min" / "Reconectar TickTick"). Botão **+ Tarefa** e **+ Evento** (Google,
como hoje).

- **Hoje:** bloco "Atrasadas" (vermelho) + tarefas e eventos do dia em ordem de horário; dia
  inteiro primeiro.
- **7 dias:** colunas/lista agrupadas por dia (hoje → +6), eventos do Google junto.
- **Calendário:** mês (pontos/títulos por dia, clique abre o dia) e semana (grade por hora;
  tarefas de dia inteiro numa faixa no topo).
- **Matriz:** 4 quadrantes; cada tarefa mostra lista, data e cor de prioridade.

Cada tarefa: círculo para concluir, título, lista (cor), data/hora, ícone ↻ se recorrente.
Clique abre o formulário de edição (título, descrição, data, hora/dia inteiro, prioridade,
lista Work/Financeiro/Estudos). Eventos do Google: abrir no Google e apagar, como hoje.
Identidade visual: acento `#E91E90`, DM Serif Display + Manrope (mesmo padrão do checkout e do
financeiro).

## Parte 5 — Testes

Vitest, módulos puros: mapeamentos (prioridade, datas SP, lista), `syncPlan` (cada regra da
Parte 3, conflito pelos dois lados, recorrente, primeira sincronização), agrupamentos das visões
(hoje/atrasadas, 7 dias, mês/semana, quadrantes). Cliente TickTick e executor sem teste de rede;
verificação manual final com o Fernando (criar no TickTick → aparece no sistema; criar no sistema
→ aparece no TickTick; concluir dos dois lados; tarefa recorrente).

## Ordem de entrega

- **Plano A:** Partes 1–3 + Parte 4 com as 4 visões, concluir, criar e editar básico.
- **Plano B:** arrastar no calendário, subtarefas, lembretes, ajustes de UX após uso real.

## Critérios de sucesso

1. Tarefa criada no app do TickTick na lista Work aparece na Agenda ao abrir.
2. Tarefa criada pelo Telegram/Jarvis aparece no TickTick na lista certa.
3. Concluir de qualquer lado conclui do outro; recorrente avança a data nos dois.
4. Tarefas da 🏠 Pessoal, 🏃 Fitness e 🧠 Brainstorm nunca aparecem no sistema.
5. As 4 visões mostram o mesmo conteúdo que o TickTick para as listas sincronizadas, mais os
   eventos do Google.
