# Financeiro FGT — Planilha no sistema + Captura por Telegram e Jarvis

**Data:** 2026-10-15
**Status:** design aprovado em conversa, aguardando revisão desta spec
**Specs anteriores relacionadas:** `2026-07-27-financeiro-flexivel-design.md`, `2026-07-28-financeiro-follow-ups.md`

---

## Contexto

O Fernando usava a planilha **"Painel Financeiro para Negócios - (oficial)"** (Google Sheets,
id `1hvmGaIgCEtleI_BrNfyT3MyC9mHaW2XGQxQ9mPqIhuA`) e diz que ela "funcionava muito bem":
é intuitiva e tem tudo que ele precisa. Ela morreu por falta de hábito de digitar:
**só janeiro (42 pagamentos, 16 recebimentos) e fevereiro (27 / 10) de 2026 foram preenchidos.**
De março em diante, vazia.

O Sistema FGT já tem uma tela `/financeiro` que tenta copiar essa planilha (abas Painel,
Mês atual, Planejamento, Lançamentos, Configurações, "Importar extrato com IA"), mas ele não a
usa: acha confusa e engessada, e ela mora num arquivo monolítico de ~1.770 linhas
(`src/app/(dashboard)/financeiro/page.tsx`).

O problema real não é visual, é **atrito de entrada de dados**. A solução combina:

1. A tela vira um "Ctrl-C Ctrl-V" fiel da planilha, com interface boa e edição direta.
2. A entrada passa a acontecer **de onde ele já está**: Telegram (fora de casa, celular) e
   Jarvis por voz (em casa, como braço direito), em linguagem livre, por texto, voz, foto ou
   arquivo de extrato.
3. O que dá para automatizar é automatizado (custos fixos, baixa de "a pagar", lembrete de fechamento).

### Visão maior (bússola, não escopo)

O Sistema FGT deve virar um ecossistema interligado e quase 100% automático: Telegram e
Jarvis acionam as **mesmas operações** (`/api/op/*`), e tudo que é feito por um aparece no
outro e no painel. Exemplo da cadeia desejada: gera link → cliente paga → cadastro do aluno +
pagamento registrado como combinado + nota fiscal pronta, sem digitação.

---

## Objetivos

- O Fernando consegue lançar qualquer entrada ou saída em **menos de 10 segundos**, sem abrir o painel.
- Ele pergunta ao Telegram ou ao Jarvis "quais contas estão em aberto?", "qual nosso saldo?",
  "o que temos que pagar hoje?" e recebe resposta correta, vinda dos dados do sistema.
- A tela `/financeiro` mostra os mesmos blocos e números que a planilha mostraria.
- Janeiro e fevereiro de 2026 aparecem no sistema, para o histórico não começar zerado.

## Ordem de entrega

Dois planos de implementação, nesta ordem:

1. **Plano 1 — Captura e perguntas:** Partes 1, 3, 4, 5 e 7 (vocabulário, modelo de dados,
   captura por texto/foto/extrato, perguntas, crons, ferramentas do Jarvis). Ao final, ele já
   lança e consulta pelo Telegram e pelo Jarvis, mesmo com a tela antiga.
2. **Plano 2 — Tela e histórico:** Partes 2, 6 e 8 (tela nova em componentes, regra de mês,
   importação de jan/fev).

## Ajustes feitos no Plano 1 (2026-10-16)

1. `CapturePending` tem `kind` (`confirm | question | undo | correction`) e `chatId` fixo `"owner"`, sem `userId`.
2. O interpretador tem também a ação `recategorize` (responder "é ferramenta" por voz).
3. Os dois crons mensais viraram um slot `monthly` (dia 1, 09h BRT).
4. Linhas de extrato de transferência entre contas próprias, pagamento de fatura ou aplicação/resgate são ignoradas (`IGNORAR`), para não contar em dobro com a fatura do cartão.
5. Modelo: Haiku 5.5 em tudo, um modelo por tarefa (`capture`, `ask`, `categorize`, `document`). A tarefa que falhar na avaliação com frases reais (`npm run eval:finance`) sobe para Sonnet 5.5, só ela.

## Fora de escopo (registrado para depois)

- **Spec B: Jarvis agente geral + cobrança escalonada** (próximo passo combinado, ver final).
- Saldo bancário em tempo real via Open Finance (Pluggy, Belvo): pago, fica para avaliação futura.
- Cadastro automático completo do aluno a partir do checkout.
- Redesenho das demais telas (alunos, CRM, home) e paleta geral do dashboard.
- Itens "adiado sem urgência" do `2026-07-28-financeiro-follow-ups.md` que não são tocados aqui.

---

## Decisões tomadas na conversa

| Tema | Decisão |
|---|---|
| Abordagem | **Captura primeiro**: aproveitar a estrutura, construir a entrada e refazer a tela. Não usar a planilha do Google como UI (evita duas fontes de verdade). |
| Tela do Mês | **Opção A**: espelho da planilha, Pagamentos à esquerda e Recebimentos à direita. |
| Planejamento anual | **Opção A**: idêntico à planilha, 12 meses × Projetado/Realizado, rolagem horizontal, grupos recolhíveis. |
| Painel | Proposta única aprovada (detalhada abaixo). |
| Canais de captura | Texto/voz (A), foto de comprovante (B) e arquivo de extrato/fatura (C). Telegram e Jarvis. |
| Linguagem | **Livre, por contexto, nunca frase pronta.** Ver regra em "Interpretação". |
| Dúvida | Grava como **a revisar** e, quando possível, **pergunta** com botões. Sem resposta, fica "a revisar". |
| Recebimentos | InfinitePay (automático, já existe) + Pix direto no **C6** (pela captura). Herospark não é mais usado. |
| Saldo bancário | "Estimado": último saldo de extrato + movimentos posteriores, sempre dito como estimado. |

---

## Parte 1 — Vocabulário oficial (vem da planilha)

As listas da planilha passam a ser a **única** fonte de categorias e formas de pagamento,
armazenadas em `FinancialConfig` e semeadas por migração/seed. Isso também resolve a pendência
"vocabulário de formas de pagamento fragmentado em cinco listas" do follow-ups de 2026-07-28:
o código passa a ler daqui, e `RECEIVABLE_METHODS` e os demais viram derivados ou fallback.

**Categorias de receita** (`income_cat`): Consultoria semestral, Consultoria anual,
Consultoria trimestral, Aulas presenciais.

**Categorias de saída** (`expense_cat`), cada uma com um **grupo** da DRE da planilha:

| Grupo | Categorias |
|---|---|
| `fixo` (Custos fixos) | Prolabore, Ferramentas e plataformas, Estagiário, Contabilidade, INSS |
| `variavel` (Custos variáveis) | Impostos Simples |
| `despesa` (Despesas) | Taxa de antecipação, Outras despesas |
| `investimento` (Investimentos) | Tráfego pago, Equipamentos, Conhecimento, Marketing |
| `destinacao` (abaixo do resultado) | Distribuição Lucros, Reserva Financeira, Reserva de oportunidades |

**Formas de pagamento** (`pay_method`): Pix/débito PJ, Cartão crédito (Nubank PF),
Cartão crédito (Natália), C6.
**Formas de recebimento** (`recv_method`): InfinitePay, Pix C6, Dinheiro.

Cada forma de pagamento/recebimento tem uma **conta** associada (C6, Nubank PF, Cartão Natália,
InfinitePay, Dinheiro), usada no cálculo de saldo estimado. O Fernando continua podendo
adicionar ou renomear itens na aba de configurações. Rótulos são gravados **literalmente**,
como já decidido no follow-up #3.

> As formas de pagamento exatas que ele usa hoje devem ser confirmadas no primeiro uso. A
> lista acima vem da planilha + "C6" citado na conversa. O seed é editável, não é trava.

---

## Parte 2 — Tela `/financeiro`

Três abas no topo: **Painel · Mês · Planejamento anual**, com seletor de mês/ano à direita.
Configurações (categorias, formas, metas, custos fixos) ficam num ícone de engrenagem, não numa aba.
A aba "Lançamentos" atual é absorvida pela aba Mês, e o modal de importar extrato sai da tela
(a importação passa a ser pelo Telegram; na tela fica só um botão "Enviar extrato" com o mesmo
fluxo, para quem estiver no computador).

Identidade: acento rosa `#E91E90` e fontes DM Serif Display (títulos) + Manrope (corpo),
alinhado ao checkout já aprovado. Superfícies claras para as tabelas, por legibilidade. A paleta
geral do dashboard é outro projeto.

### 2.1 Aba Mês (espelho da planilha)

1. **Faixa de 4 números:** Entradas · Saídas · Saldo do mês · Pendências (a pagar / a receber).
2. **Alerta "a revisar":** quando houver lançamentos com `needsReview`, aparece uma faixa
   *"N lançamentos para revisar"* que filtra e destaca essas linhas.
3. **Saldo do mês (calculado) × Saldo do banco** (como na planilha): o saldo do banco vem do
   último extrato importado daquele mês ou é digitado; a diferença aparece em destaque.
4. **Duas tabelas lado a lado:**
   - Pagamentos: Data · Valor · Categoria · Descrição · Forma de pgto · Status (PAGO / A PAGAR)
   - Recebimentos: Data · Valor · Cliente · Categoria · Forma de receb. · Status (RECEBIDO / A RECEBER)
5. **Edição direta na célula** (clicar, editar, Enter salva). Status alterna com um clique.
   Linha nova com "+ nova linha" no rodapé da tabela. Excluir pelo menu da linha, com desfazer.
6. Uma pequena etiqueta de origem por linha (Telegram, Jarvis, extrato, foto, fixo, InfinitePay,
   planilha) para ele saber de onde veio cada lançamento.
7. No celular, as duas tabelas empilham (Pagamentos primeiro).

### 2.2 Aba Painel

- Linha 1: **Meta do mês** (R$35.000, editável) com barra de progresso · **Lucro do mês** e
  margem · **Custos e despesas** em % da receita.
- Linha 2: **Capital de giro**, **Reserva financeira** e **Reserva de oportunidades**: realizado / meta
  com barra (as metas da planilha ficam em `FinancialConfig` `goal`, chaves já existentes
  `cap_giro`, `reserva_fin`, `reserva_oport`).
- Gráfico: **receita projetada × realizada**, 12 meses.
- Tabela resumo anual por mês: Receitas · Custos e despesas · % custos · Lucro/Prejuízo ·
  % Margem · Distribuição de lucros · Reserva financeira · Reserva de oportunidades
  (o bloco `H38:T46` da planilha).

### 2.3 Aba Planejamento anual (idêntico à planilha)

Linhas, na ordem da planilha:

```
(=) CAIXA INICIAL
(+) RECEITAS            → uma linha por categoria de receita
(-) CUSTOS FIXOS        → uma linha por categoria do grupo fixo
(-) CUSTOS VARIÁVEIS    → idem
(-) DESPESAS            → idem
(-) INVESTIMENTOS       → idem
(=) RESULTADO MENSAL    = receitas − fixos − variáveis − despesas − investimentos
(-) Distribuição Lucros / Reserva Financeira / Reserva de oportunidades
(=) FECHAMENTO CAIXA    = caixa inicial + realizado(receitas) − realizado(todas as saídas, incl. destinação)
```

Colunas: para cada mês, **Projetado** (editável na célula) e **Realizado** (calculado,
somente leitura). Rolagem horizontal com a coluna de rótulos fixa. Grupos recolhíveis.
Caixa inicial do mês N = fechamento de caixa do mês N−1 (o primeiro mês usa o
`saldoInicial` de `FinancialMonthClose`).

### 2.4 Regra de mês (corrige o defeito #2 de 2026-07-28)

A tela nova **não** usa `inMonth(dueDate) || inMonth(paidAt)`. Cada lançamento pertence a
exatamente um mês:

- **Realizado** (pago/recebido): mês de `paidAt`; para linhas derivadas de venda com
  `_flow: "caixa"`, mês de `cashDate`; para `_flow: "faturamento"`, mês de `dueDate`.
- **Pendente** (a pagar/a receber): mês de `dueDate`.

As somas continuam usando `sumCaixa` / `sumFaturamento` de `aggregates.ts`, sem duplicar
parcelas de venda. "Entradas" e "Receitas realizadas" na tela são **caixa**.

---

## Parte 3 — Captura (Telegram e Jarvis)

### 3.1 Porta única

`POST /api/op/finance/capture`, protegido por `OP_INTERNAL_SECRET` como o resto de `/api/op/*`.
Recebe uma de três entradas:

```ts
type CaptureInput =
  | { kind: "text"; text: string; channel: "telegram" | "jarvis" | "painel" }
  | { kind: "image"; imageBase64: string; mimeType: string; caption?: string; channel: "telegram" | "painel" }
  | { kind: "file"; fileBase64: string; fileName: string; mimeType: string; channel: "telegram" | "painel" };
```

Devolve:

```ts
type CaptureResult = {
  saved: CapturedTx[];         // já gravados (cada um com id para desfazer)
  needsConfirmation: CapturedTx[]; // propostos, não gravados (foto/extrato)
  questions: CaptureQuestion[];    // dúvidas com opções (ex: categoria A ou B)
  settled: { txId: string; description: string }[]; // "a pagar" que receberam baixa
  skippedDuplicates: number;
  summary: string;             // texto pronto para responder ao usuário
};
```

O Telegram (`src/lib/openclaw/`) e o Jarvis (`FGT-Jarvis-Bridge/server.js`, via `callOp`)
são clientes finos dessa rota. Nenhuma lógica financeira mora neles.

### 3.2 Interpretação por contexto (regra central)

Linguagem livre, nunca match de frase. Regra registrada em memória do projeto
(`feedback_contexto_nao_frase_literal`). O interpretador é um modelo Claude (um modelo por tarefa no
código, padrão Haiku 5.5; a tarefa que falhar na avaliação com frases reais sobe para Sonnet 5.5) chamado com **tool use / saída estruturada** e
um contexto montado a cada chamada com:

- as categorias (com grupo) e formas de pagamento oficiais;
- os lançamentos **a pagar / a receber em aberto** (para entender "boleto contadora foi pago");
- os custos fixos cadastrados;
- nomes dos alunos/clientes ativos (para ligar recebimentos a `clientId`);
- a data de hoje (America/Sao_Paulo).

Exemplos reais que precisam funcionar (viram casos de teste):

| Mensagem | Resultado esperado |
|---|---|
| "paguei 39 mfit pix" | saída, R$39,00, Ferramentas e plataformas, Pix/débito PJ, pago, hoje |
| "gastei 39,90 mfit no cartão da natália" | saída, R$39,90, Ferramentas e plataformas, Cartão crédito (Natália), pago |
| "boleto contadora foi pago" | **baixa** no "a pagar" de Contabilidade em aberto do mês; não cria linha nova |
| "a contadora já tá paga, deu 407,29" | baixa no mesmo "a pagar", ajustando o valor para 407,29 |
| "recebi 1800 da Aleska anual no C6" | entrada, R$1.800, Consultoria anual, Pix C6, recebido, ligada à cliente Aleska se existir |
| "vence dia 31 o CREF, 444" | saída **a pagar**, R$444, Outras despesas, vencimento 31 do mês corrente |
| "chatgpt 57 cartão natália" | categoria ambígua (Ferramentas × Conhecimento) → grava como a revisar **e** pergunta |
| "desfaz o último" / "apaga esse do mfit" | desfaz o lançamento ou a baixa mais recente que bate com a descrição (até 24h) |

**Política de confiança:**
- Valor, tipo e categoria claros → **grava direto** e responde com resumo + botão/comando "desfazer".
- Valor claro, categoria incerta → grava com `needsReview = true` e **pergunta** (até 3 opções).
  Responder atualiza a linha e limpa `needsReview`.
- Valor ausente ou mensagem sem sentido financeiro → não grava, pergunta o que faltou.
- Foto e extrato → **nunca gravam sem confirmação** (`needsConfirmation`).

### 3.3 Foto de comprovante (Telegram)

O webhook do Telegram passa a aceitar `message.photo` (maior resolução) e `message.document`
de imagem. A imagem vai para o interpretador como entrada de visão. Resposta:
*"Entendi: R$1.094,67 · Tráfego pago · Cartão Nubank PF · 15/10. ✅ Confirmar / ✏️ Corrigir"*.
"Corrigir" aceita texto livre ("é marketing, não tráfego") e reinterpreta mantendo o resto.

### 3.4 Extrato e fatura (C6, Nubank)

Formatos aceitos: **OFX, CSV e PDF**.

1. **Leitura determinística primeiro:** OFX tem parser próprio (data, valor, memo, `FITID`).
   CSV é lido com detecção de colunas data/valor/descrição. PDF vai para o modelo como documento.
2. **Saldo:** quando o arquivo traz saldo final (OFX `LEDGERBAL`, ou linha de saldo), grava um
   `BankBalanceSnapshot` para a conta do arquivo.
3. **Categorização em lotes** pelo interpretador, **sem truncar** o arquivo (o importador atual
   corta em 8.000 caracteres e usa categorias genéricas; ele é substituído).
4. **Deduplicação** (`dedupe.ts`) antes de propor:
   - mesmo `externalId` (FITID ou hash `conta+data+valor+descrição`) já importado → pula;
   - recebimento que bate com uma linha de caixa de venda InfinitePay (valor líquido ±R$0,05,
     data ±3 dias) → pula;
   - saída que bate com um "a pagar" em aberto (valor ±1%, data ±5 dias, categoria compatível)
     → propõe **baixa** em vez de linha nova;
   - lançamento manual já existente com mesmo valor e data ±2 dias → pula.
5. Resposta: *"Extrato C6 · setembro: 32 novos, 4 já existiam, 2 baixas em contas a pagar,
   3 sem categoria clara. ✅ Gravar todos / 👀 Revisar no painel"*. "Gravar todos" grava
   (os incertos com `needsReview`). "Revisar no painel" grava todos como `needsReview` e manda o link da aba Mês.

### 3.5 Botões no Telegram

Confirmações e perguntas usam `inline_keyboard` com `callback_data` curto apontando para um
registro pendente (`CapturePending`, expira em 7 dias). O webhook passa a tratar
`callback_query`. Pendência expirada → o que já foi gravado fica como "a revisar"; o que era só
proposta (foto/extrato) é descartado, com aviso.

### 3.6 Jarvis (voz)

No `FGT-Jarvis-Bridge/server.js`, duas ferramentas MCP novas, no padrão do arquivo
(`server.registerTool`, `zod`, nomes em português):

- `registrar_financeiro({ texto })` → `POST /api/op/finance/capture` com `kind: "text"`, `channel: "jarvis"`.
- `consultar_financeiro({ pergunta })` → `POST /api/op/finance/ask` (Parte 4).

Por voz não há botões: quando o resultado tiver `questions`, o Jarvis lê a pergunta e a resposta
falada volta como novo `registrar_financeiro` ("é ferramenta"), interpretado com o contexto dos
lançamentos `needsReview` recentes. Foto e extrato são só pelo Telegram (ou painel).

---

## Parte 4 — Perguntas financeiras (Telegram e Jarvis)

`POST /api/op/finance/ask` recebe `{ pergunta: string, channel }` e responde em texto curto,
pronto para falar ou enviar.

Implementação: o modelo recebe a pergunta e um conjunto de **ferramentas de leitura**
(tool use), cada uma uma função pura sobre o banco:

| Ferramenta | Responde |
|---|---|
| `contas_em_aberto({ tipo: "pagar" \| "receber" \| "ambos", ate?: data })` | "quais contas estão em aberto?", "o que temos que pagar hoje/essa semana?" |
| `saldo_estimado({ conta?: string })` | "qual nosso saldo?", "quanto tem no C6?" |
| `resumo_periodo({ de, ate })` | "quanto entrou essa semana?", "quanto gastei em setembro?" |
| `resultado_mes({ mes })` | "quanto sobrou esse mês?", lucro, margem, % custos |
| `progresso_metas({ mes })` | meta de R$35k, capital de giro, reservas |
| `gastos_por_categoria({ de, ate, categoria? })` | "quanto foi de tráfego esse mês?" |
| `lancamentos_a_revisar()` | "tem coisa pra revisar?" |

**Saldo estimado** = último `BankBalanceSnapshot` da conta + soma dos lançamentos **realizados**
daquela conta com data posterior ao snapshot. A resposta sempre diz a base:
*"Saldo estimado C6: R$4.230 (extrato de 01/10 + 12 lançamentos depois)."* Sem snapshot, a
resposta diz que não sabe e pede o extrato.

O classificador do Telegram (`classifier.ts`) ganha a intenção `finance_capture` (lançar) e
`finance_ask` (perguntar) e encaminha para essas rotas. Fotos e arquivos vão direto para
`capture`, sem passar pelo classificador. Este padrão de "pergunta + ferramentas de leitura" é o
mesmo que a Spec B vai estender para o sistema inteiro.

---

## Parte 5 — Automação

- **Custos fixos recorrentes:** novo modelo `RecurringCost` (categoria, descrição, valor, dia do
  vencimento, forma de pagamento, ativo). Semeado com os fixos projetados da planilha
  (Prolabore 8.000, Ferramentas e plataformas 765, Estagiário 600, Contabilidade 398, INSS 220,
  Impostos Simples 1.700), editável nas configurações. No dia 1 de cada mês, um cron cria os
  "a pagar" do mês. É idempotente: não duplica se rodar duas vezes (chave
  `recurringCostId + mês`).
- **Baixa automática:** feita pelo dedupe do extrato (3.4) e pela interpretação de texto (3.2).
- **Lembrete de fechamento:** no dia 1 às 09h BRT, Telegram:
  *"Fechamento de setembro: me manda o extrato do C6 e a fatura do Nubank. Tem 5 lançamentos a revisar."*
- Os dois crons novos entram no `vercel.json` como slots de `/api/cron/jarvis`
  (`slot=monthly_fixed`, `slot=monthly_close`), reutilizando a autenticação por `CRON_SECRET`.

---

## Parte 6 — Importação da planilha (jan e fev de 2026)

Script único `scripts/import-planilha-2026.ts`, rodado manualmente, com `--dry-run` padrão:

- Lê o `.xlsx` exportado da planilha (caminho por argumento).
- Abas JAN/FEV: cada linha de **Pagamentos** vira `FinancialTx` (`type: "despesa"`) e cada linha
  de **Recebimentos** vira `FinancialTx` (`type: "receita"`), com `source: "planilha"`, status
  mapeado (PAGO/RECEBIDO → pago; A PAGAR/A RECEBER → pendente), cliente casado por nome quando existir.
- "Planejamento anual" → valores **Projetado** de cada categoria e mês para `FinancialBudget`.
- "Painel financeiro" → metas `cap_giro` (10.000) e o realizado atual nos `goal` existentes.
- Pula linhas que já existem (mesmo dedupe da Parte 3). O dry-run imprime o que seria criado e
  os totais por mês, para conferir contra a planilha (jan: entradas R$16.980,00 / saídas
  R$23.333,60; fev: R$12.740,00 / R$7.530,78) antes de gravar.

---

## Parte 7 — Modelo de dados (mudanças)

```prisma
model FinancialTx {
  // ...campos existentes...
  source       String?   // manual | telegram | jarvis | foto | extrato | recorrente | planilha | infinitepay
  needsReview  Boolean   @default(false)
  rawInput     String?   // mensagem original ou linha do extrato, para auditoria
  externalId   String?   // FITID ou hash de dedupe
  recurringCostId String?
  @@index([externalId])
}

model FinancialConfig {
  // ...campos existentes...
  group   String?   // categorias de saída: fixo | variavel | despesa | investimento | destinacao
  account String?   // formas de pagamento/recebimento: C6 | Nubank PF | Cartão Natália | InfinitePay | Dinheiro
}

model FinancialBudget {      // Projetado por categoria e mês
  id       String @id @default(cuid())
  userId   String
  month    String // YYYY-MM
  category String
  amount   Float
  @@unique([userId, month, category])
}

model RecurringCost {
  id            String  @id @default(cuid())
  userId        String
  category      String
  description   String
  amount        Float
  dayOfMonth    Int
  paymentMethod String?
  active        Boolean @default(true)
}

model BankBalanceSnapshot {
  id      String   @id @default(cuid())
  userId  String
  account String
  balance Float
  asOf    DateTime
  source  String   // extrato | manual
}

model CapturePending {       // confirmações/perguntas aguardando resposta no Telegram
  id        String   @id @default(cuid())
  payload   Json
  chatId    String
  createdAt DateTime @default(now())
  expiresAt DateTime
}
```

Relações com `User` seguem o padrão dos modelos existentes. Migração aditiva: nenhum campo
existente muda de tipo, dados atuais continuam válidos.

---

## Parte 8 — Organização do código

```
src/lib/financeiro/
  vocab.ts              categorias, grupos, formas, contas (lê FinancialConfig, com fallback do seed)
  monthRules.ts         regra de mês da Parte 2.4 + agregados Mês/Painel/Planejamento
  dedupe.ts             regras da Parte 3.4
  recurring.ts          geração idempotente dos fixos do mês
  balance.ts            saldo estimado
  capture/
    context.ts          monta o contexto do interpretador
    interpret.ts        chamada ao modelo (texto/imagem/documento) → propostas
    statement.ts        parsers OFX/CSV + roteamento PDF
    apply.ts            grava, dá baixa, cria pendências
  ask/
    tools.ts            ferramentas de leitura da Parte 4
    answer.ts           loop de tool use

src/app/api/op/finance/capture/route.ts
src/app/api/op/finance/ask/route.ts
src/app/(dashboard)/financeiro/
  page.tsx              casca: abas + seletor de mês (pequena)
  PainelTab.tsx  MesTab.tsx  PlanejamentoTab.tsx  ConfigDrawer.tsx
  components/EditableCell.tsx  TxTable.tsx ...
scripts/import-planilha-2026.ts
```

O `page.tsx` monolítico é desmontado nesses arquivos. Isso cumpre a pendência "deve ser feita
antes do passo 2 do roadmap" do follow-ups de 2026-07-28. Rotas antigas em
`/api/financeiro/*` continuam funcionando até a tela nova estar no ar. O
`/api/financeiro/extrato` é removido quando o novo fluxo substituí-lo.

---

## Parte 9 — Erros e segurança

- **Falha ou timeout do modelo:** a mensagem original é gravada como `FinancialTx` com
  `needsReview = true`, valor 0 se não houver número legível, e `rawInput` preenchido. A resposta
  diz *"Não consegui entender agora, deixei pra revisar"*. Nada do que ele mandou se perde.
- **Arquivo ilegível ou formato não suportado:** responde pedindo OFX ou CSV e explica como
  exportar no app do banco.
- **Desfazer:** todo lançamento gravado pela captura pode ser desfeito por 24h (botão no
  Telegram, comando "desfaz o último" no Jarvis). Desfazer uma baixa volta o "a pagar" para pendente.
- **Somente o dono:** captura e perguntas só respondem ao `TELEGRAM_ALLOWED_CHAT` e às chamadas
  com `OP_INTERNAL_SECRET`, como hoje. Arquivos e imagens não são guardados depois de
  interpretados, só os lançamentos e o `rawInput` textual.

---

## Parte 10 — Testes (Vitest, padrão já usado em `src/lib/financeiro`)

- `monthRules.test.ts`: uma parcela vencida em 15/07 e paga em 01/08 conta **só** em agosto
  (realizado); Resultado, % custos, margem e Fechamento de caixa batem com fórmulas da planilha;
  **totais de jan/fev 2026 importados conferem com a planilha** (R$16.980,00 / R$23.333,60 e
  R$12.740,00 / R$7.530,78).
- `dedupe.test.ts`: FITID repetido; recebimento InfinitePay vs linha de extrato; baixa de
  "a pagar" por valor/data; manual duplicado.
- `recurring.test.ts`: gera os fixos do mês; rodar duas vezes não duplica; custo inativo não gera.
- `balance.test.ts`: snapshot + movimentos posteriores; sem snapshot.
- `statement.test.ts`: OFX e CSV de exemplo (fixtures anonimizadas no formato C6 e Nubank).
- `capture/interpret` e `ask`: testes com o modelo **mockado** para a montagem do contexto e a
  aplicação do resultado, e uma suíte de avaliação opcional (`npm run eval:finance`, fora do CI)
  rodando as frases reais da tabela 3.2 contra o modelo de verdade.
- Verificação manual final: mandar no Telegram uma frase, uma foto e um extrato reais;
  perguntar ao Jarvis "o que temos que pagar hoje?".

---

## Critérios de sucesso

1. "paguei 39 mfit pix" no Telegram aparece na aba Mês em segundos, na categoria certa.
2. "boleto contadora foi pago" dá baixa no "a pagar" existente, sem criar duplicado.
3. Um extrato C6 real é importado sem duplicar recebimentos da InfinitePay.
4. "quais contas estão em aberto?" e "qual nosso saldo?" respondem certo no Telegram e no Jarvis.
5. A aba Planejamento anual de jan/fev 2026 mostra os mesmos números da planilha.
6. Os fixos do mês aparecem sozinhos no dia 1 como "a pagar".
7. O Fernando usa o financeiro por 4 semanas seguidas sem voltar para a planilha.

---

## Próximo passo combinado: Spec B — Jarvis agente geral + cobrança escalonada

Não faz parte desta entrega. Registrado aqui para não se perder:

1. **Consulta a tudo do sistema:** o Telegram e o Jarvis respondem perguntas sobre alunos, CRM,
   tarefas, agenda e financeiro, usando o mesmo padrão de "pergunta + ferramentas de leitura" da
   Parte 4, estendido a todos os módulos. O motor do bot sai da lista fixa de intenções para um
   agente com ferramentas.
2. **Cobrança escalonada em tudo** (tarefas, contas a pagar, alunos inadimplentes,
   follow-ups): o tom endurece com o atraso. Referência de tom aprovada pelo Fernando, palavrão
   liberado, frases variadas e inventadas pelo agente:
   - Dia 0: "Fernando, hoje vence: gravar reels de quinta."
   - Dia 1–2: "Ainda não gravou os reels. Bora, isso é prioridade."
   - Dia 3+: "Porra, Fernando, 3 dias e nada desses reels, caralho. Para tudo e grava AGORA. 🔥"
