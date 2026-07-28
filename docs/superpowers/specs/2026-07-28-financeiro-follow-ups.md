# Financeiro Flexível — Pendências conhecidas

**Data:** 2026-07-28
**Origem:** revisão final da branch `feat/financeiro-flexivel` (17 commits, 95 testes)
**Status:** aprovado para merge com estes itens deliberadamente adiados

Nenhum item abaixo bloqueia o uso do sistema. Todos foram encontrados por revisão,
avaliados e adiados de forma consciente — este documento existe para que não se percam.

---

## Corrigir cedo no próximo ciclo

### 1. `cashDate` e `netValue` não são editáveis depois de criar a venda
A rota `PATCH /api/financeiro/vendas/[id]/parcelas/[parcelaId]` aceita `status`,
`dueDate`, `amount`, `notes` e `paymentMethod` — mas não `cashDate` nem `netValue`.
O `ReceivablesTable` só existe na criação.

Consequência: mudar o vencimento de uma parcela no cartão move a linha de faturamento
de mês, mas a linha de caixa continua ancorada na data antiga, e não há como corrigir
pela interface. A spec vende a regra de data como "um padrão inteligente, não uma trava";
depois de salvar, é exatamente uma trava.

### 2. Contagem cruzada de meses (pré-existente, o maior defeito restante)
`financeiro/page.tsx` usa `inMonth(dueDate) || inMonth(paidAt)` nos agregados.
Uma parcela vencida em 15/07 e marcada como paga em 01/08 casa com **julho e agosto**.
No total anual do Painel ela é contada duas vezes.

Não foi introduzido por esta branch, mas é o defeito de dinheiro mais relevante que
sobrou no módulo. Deve ser o primeiro item do próximo ciclo.

### 3. CRM e assistente normalizam a forma de pagamento antes de gravar
`crm/page.tsx` e `openclaw/actions.ts` gravam `toReceivableMethod(metodo)` no banco,
então uma forma personalizada (ex: "Plataforma") vira "Outro" e some do filtro de Forma
em Lançamentos.

O padrão correto já está no `NovaVendaModal` e no `buildSimpleSaleInstallments`:
**gravar o rótulo escolhido literalmente, normalizar apenas para derivar a data de caixa.**
Aplicar o mesmo nesses dois caminhos.

---

## Adiado sem urgência

- **Vocabulário de formas de pagamento fragmentado em cinco listas** —
  `RECEIVABLE_METHODS`, `DEFAULT_RECV_METHODS`, dois `PAYMENT_METHODS` distintos e o
  mapeamento do webhook InfinitePay. `RECEIVABLE_METHODS` não inclui "Plataforma",
  citada na spec. Unificar.
- **Prévia do "Nova Venda" arredonda diferente do que cria** — em divisão não exata,
  a prévia mostra "3x de R$ 333,33" enquanto a primeira parcela é criada com R$ 333,34.
  Total e quantidade estão corretos; só o centavo por linha diverge.
- **Rescale de `netValue` e transição de `paidAt` sem teste** — a lógica está correta e
  foi verificada à mão na revisão, mas vive na rota, sem cobertura automatizada.
- **Sem teste de divisão não exata** para `buildSimpleSaleInstallments`.
- **`buildSaleTxs` não usa `Sale.cashFlowDate` como fallback** — a spec previa
  `cashDate → Sale.cashFlowDate → dueDate`; está implementado como `cashDate → dueDate`.
  Inofensivo nos dados atuais, porque as vendas antigas gravavam `dueDate = cashFlowDate`.
- **Vendas antigas no cartão mudam o mês do faturamento** — antes a receita era datada
  em `sale.createdAt`, agora em `inst.dueDate`. Uma venda fechada em 31/07 com caixa em
  03/08 passa a contar o faturamento em agosto.
- **Presets aceitam entrada maior que o total**, gerando uma linha negativa que é
  descartada na gravação — o total da venda fica diferente da soma das parcelas.
  Falta uma validação no salvar.
- **`handleSave` falha em silêncio** quando nenhuma linha tem valor positivo: o botão
  Salvar não faz nada e não avisa. Inclui o caso de um plano com `installments <= 0`.
- **Identificadores em português** espalhados (`eraAutomatica`, `metodo`, `liquido`,
  `dataCaixa`, `descricao`). Decidir a regra ou abandoná-la explicitamente.
- **`negotiationType: "cash"`** rotula como "À vista" uma venda de linha única que vence
  daqui a 60 dias.
- **Arredondamento nas parcelas do CRM** — `total/count` sem `round2`, diferente da regra
  de sobra na primeira parcela usada em `buildPreset`.
- **`round2` tem o caso de borda clássico de ponto flutuante** em valores exatamente
  `.xx5`. Irrelevante para valores digitados por pessoa.
- **`isDerivedTxId` ainda testa o prefixo `rev_`**, que nada mais emite. Mantido de
  propósito para linhas antigas; remover quando não houver mais nenhuma.
- **`financeiro/page.tsx` continua monolítico** (~1.7k linhas). A divisão completa em
  formulário, tabelas, fechamento e filtros foi adiada explicitamente no plano e deve
  ser feita antes do passo 2 do roadmap, que volta a mexer nesse módulo.

---

## Verificação que ainda depende de dados reais

A branch foi verificada com o sistema rodando contra o banco de produção, em modo
somente-leitura — nada foi gravado. Ficou de fora, por decisão consciente:

- **Salvar uma venda nova de ponta a ponta** e conferir os valores no Financeiro.
  Fazer isso na primeira venda real, e conferir o mês antes de fechar.
