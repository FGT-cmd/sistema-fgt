# Financeiro Flexível — Recebimentos por Linha

**Data:** 2026-07-27
**Status:** Aprovado, aguardando plano de implementação
**Passo:** 1 de 4 do roadmap de padronização (ver "Contexto" abaixo)

---

## Contexto

A FGT está padronizando sua operação. O objetivo maior é que a jornada do aluno
(fechamento → pagamento → contrato → cadastro → onboarding → entrega → check-ins →
renovação) seja registrada de forma consistente, sem depender da memória do Fernando.

O roadmap acordado tem 4 passos, nesta ordem:

1. **Financeiro flexível** ← este documento
2. Checklist de fechamento/onboarding por aluno (registro do que foi feito)
3. CRM de alunos + jornada
4. Telegram/WhatsApp como camada de comando

O financeiro vem primeiro porque *pagamento é parte do fechamento*: não é possível
padronizar o fechamento enquanto o sistema não consegue registrar o pagamento do
jeito que ele realmente aconteceu.

## Problema

O formulário de venda obriga a venda inteira a ter **um único tipo de pagamento**.
Negociações reais e recorrentes não cabem no modelo:

- Entrada no Pix + restante parcelado no cartão
- Cliente dividindo em dois cartões diferentes
- Casal fazendo um pagamento único no cartão
- Parcelamento no cartão em que o Fernando assume os juros (não o aluno)

### Causa raiz (verificada no código)

O banco de dados **não** é o gargalo. `Installment` já possui `amount`, `netValue`,
`paymentMethod`, `dueDate`, `paidAt`, `status`, `label` e `notes` — cada parcela já
pode ter forma de pagamento própria. `POST /api/financeiro/vendas` já aceita
`customInstallments` totalmente livres.

O engessamento está na camada de UI, em três pontos:

1. **`src/app/(dashboard)/alunos/page.tsx:293`** — `handleSave()` ramifica em
   `if (negType === "card")` e colapsa a venda inteira em **uma linha única**
   rotulada `"Cartão — entrada no caixa"`, descartando qualquer estrutura de parcelas.
2. **Mesmo arquivo, ramo `else`** — as parcelas são criadas sem `paymentMethod`.
   O rascunho `InstallmentDraft` só carrega `amount`, `dueDate` e `label`, mesmo
   com a API e o banco suportando forma de pagamento por parcela.
3. **`src/app/(dashboard)/alunos/page.tsx:298`** — `netValue = gross` está fixo,
   com o comentário *"taxa é do aluno"*. Não há como registrar os casos em que o
   Fernando absorve a taxa do cartão.

Como consequência, **`src/app/(dashboard)/financeiro/page.tsx:1471`**
(`const isCard = sale.negotiationType === "card"`) exibe a venda inteira segundo um
tipo só, ignorando a forma de pagamento individual das parcelas.

### Problema estrutural agravante

`src/app/(dashboard)/financeiro/page.tsx` tem 1.683 linhas / ~95 KB em um único
arquivo. O tamanho torna qualquer alteração arriscada e é uma causa direta de
trabalho que fica pela metade.

## Solução

**A venda deixa de ter "um tipo" e passa a ser uma lista de recebimentos.**
Cada linha carrega os seus próprios atributos. Não há caso especial por forma de
pagamento — uma estrutura única absorve todas as combinações, inclusive as futuras.

Formatos que a FGT realmente pratica hoje, e como cada um fica:

| Caso real | Representação |
|---|---|
| Valor total no cartão | 1 linha Cartão; caixa em 1 dia útil |
| Pix à vista | 1 linha Pix; caixa no mesmo dia |
| Pix parcelado: entrada + até 3x | 2 a 4 linhas Pix, com vencimentos distintos |
| Entrada + restante no cartão dias depois | 1 linha da entrada + 1 linha Cartão futura |
| Entrada + restante no Pix dias depois | 1 linha da entrada + 1 linha Pix futura |
| Dois cartões diferentes | 2 linhas, ambas Cartão, valores distintos |
| Casal, pagamento único no cartão | 1 linha no valor cheio |

### 1. Modelo de dados

Uma única alteração de schema:

```prisma
model Installment {
  // ... campos existentes ...
  cashDate DateTime?  // NOVO: data de entrada real no caixa
}
```

Hoje a data de entrada no caixa existe apenas no nível da venda
(`Sale.cashFlowDate`), o que impede que linhas da mesma venda caiam em datas
diferentes — exatamente o caso de entrada à vista + parcelas futuras.

**Semântica das datas por linha:**
- `dueDate` — data combinada com o aluno (o que foi negociado)
- `cashDate` — data em que o dinheiro efetivamente entra na conta

**Preenchimento automático de `cashDate`.** Os prazos de recebimento da FGT são
previsíveis, então o formulário calcula `cashDate` a partir da forma de pagamento,
sem digitação manual:

| Forma de pagamento | `cashDate` |
|---|---|
| Pix | mesma data de `dueDate` (cai na hora) |
| Cartão | `dueDate` + 1 dia útil (pula fim de semana) |
| Demais formas | igual a `dueDate`, editável |

O valor é sempre editável — a regra é um padrão inteligente, não uma trava.

**Taxa do cartão — sem campo novo.** A relação entre `amount` (bruto) e `netValue`
(líquido) já expressa quem absorveu a taxa:

- `netValue == amount` → taxa paga pelo aluno; o Fernando recebe o valor cheio
- `netValue < amount` → taxa absorvida pelo Fernando; a diferença é o custo

`Sale.negotiationType` permanece na tabela, mas **deixa de controlar lógica**.
Passa a ser rótulo descritivo ("À vista", "Parcelado") para leitura rápida.

### 2. Formulário de venda

O seletor de tipo de negociação deixa de ramificar o comportamento. O formulário
passa a ser uma tabela de recebimentos com linhas livres. Cada linha tem:

| Campo | Descrição |
|---|---|
| Valor (bruto) | Valor combinado da linha |
| Forma de pagamento | Pix, Cartão, Dinheiro, InfinitePay, Plataforma, Outro |
| Vencimento | Data combinada (`dueDate`) |
| Entrada no caixa | Data real de crédito (`cashDate`) |
| Quem assume a taxa | Alternância Aluno / Fernando — decidida **por linha** |
| Pago? | Marca a linha como quitada |
| Rótulo | Texto livre ("Entrada", "1ª parcela") |

Quando a taxa for do Fernando, o formulário pede o valor ou percentual da taxa e
calcula `netValue` automaticamente. O Fernando não faz conta na mão.

#### Atalhos de negociação

Como os formatos praticados se repetem, o formulário oferece atalhos que montam as
linhas prontas a partir do valor total. O Fernando ajusta valores e datas depois.

| Atalho | Linhas geradas |
|---|---|
| Total no cartão | 1 linha Cartão, caixa em 1 dia útil |
| Pix à vista | 1 linha Pix, caixa no mesmo dia |
| Entrada + parcelas no Pix | 1 linha de entrada + 2 ou 3 linhas Pix mensais |
| Entrada + restante no cartão | 1 linha de entrada + 1 linha Cartão futura |
| Entrada + restante no Pix | 1 linha de entrada + 1 linha Pix futura |

Regras dos atalhos:

- O valor total informado é distribuído entre as linhas; a entrada é editável e o
  restante se divide igualmente entre as parcelas.
- Os vencimentos das parcelas são espaçados mensalmente a partir da data de entrada.
- `cashDate` de cada linha segue a regra automática da forma de pagamento.
- **Atalho é ponto de partida, nunca trava.** Após aplicá-lo, todas as linhas
  continuam editáveis, e linhas podem ser adicionadas ou removidas livremente.
- Montar a venda do zero, linha a linha, continua disponível e não exige atalho.

A análise por IA existente (`/api/alunos/analisar`, que interpreta a negociação em
texto livre) permanece, agora podendo preencher também forma de pagamento por linha.

### 3. Exibição no financeiro

O financeiro passa a somar **por linha de recebimento**, não pelo tipo da venda:

- **Faturamento** = soma dos valores brutos (`amount`), pela data de vencimento (`dueDate`)
- **Caixa** = soma dos valores líquidos (`netValue`), pela data de entrada (`cashDate`)

É isso que faz faturamento e caixa baterem com a realidade quando há taxa absorvida
ou antecipação de recebíveis.

### 4. Outros pontos de criação de venda

Três lugares criam vendas fora do formulário principal e precisam continuar
consistentes com o modelo novo:

- `src/app/(dashboard)/crm/page.tsx:383` — conversão de negócio fixa `negotiationType: "pix"`
- `src/lib/openclaw/actions.ts:239` — criação via assistente fixa `negotiationType: "pix"`
- `src/lib/infinitepay-webhook.ts:118` — venda originada do checkout

Como `negotiationType` deixa de controlar lógica, esses pontos passam a apenas
gravar as linhas de recebimento corretas. Nenhum deles precisa de reescrita ampla.

### 5. Quebra do arquivo monolítico

`financeiro/page.tsx` (1.683 linhas) é dividido em módulos menores e focados —
formulário de venda, tabelas de listagem, fechamento mensal, filtros.

Isso não é faxina opcional: é pré-requisito para os passos 2, 3 e 4 do roadmap,
que voltarão a mexer nesse módulo. Cada arquivo deve ter um propósito claro e ser
compreensível isoladamente.

## Migração de dados

**Nenhuma perda, nenhum retrabalho manual.**

Vendas antigas criadas pelo ramo de cartão possuem uma linha única rotulada
`"Cartão — entrada no caixa"`. No modelo novo isso continua sendo uma venda válida
de uma linha só — a estrutura nova é um superconjunto da antiga.

O campo `cashDate` é opcional. Para linhas existentes, ele fica nulo e o sistema usa
`Sale.cashFlowDate` (quando presente) ou `dueDate` como fallback.

## Fora de escopo

Deliberadamente **não** fazem parte deste passo:

- Checklist de fechamento/onboarding por aluno (passo 2)
- CRM de alunos e jornada (passo 3)
- Integração WhatsApp / comandos via Telegram (passo 4)
- Decisão sobre tarefas (TickTick vs. módulo interno)
- Reestruturação do Notion

## Critérios de sucesso

A implementação está completa quando o Fernando conseguir registrar, sem gambiarra:

1. Uma venda com entrada no Pix e o restante parcelado no cartão
2. Uma venda dividida em dois cartões diferentes
3. Uma venda em que ele assume os juros do cartão, com o caixa refletindo o líquido
4. Um pagamento único à vista
5. Uma venda com entrada + restante no Pix alguns dias depois
6. Faturamento e caixa do mês batendo com a realidade em todos os casos acima
7. Todas as vendas já existentes continuando visíveis e corretas
8. Os atalhos de negociação montando as linhas corretamente, e permitindo edição
   livre de qualquer linha depois de aplicados
