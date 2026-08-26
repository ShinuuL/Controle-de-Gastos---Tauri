# Relatório de correções da revisão final — Moranguinho

Base de trabalho: `f0393dd1d148e3a2615d885d48ac1c0f8768fdcc`.

## Escopo entregue

- No estado vazio, o dashboard Moranguinho renderiza uma única `BalanceMoodCard` com `realizedCents={0}` antes da mensagem de nenhuma movimentação. O estado com dados continua usando `DashboardSummaryCards`, sem duplicar o card de reação.
- O card de reação não troca mais para coluna em `xl`; a imagem permanece ao lado do conteúdo a partir de `sm`, sem largura total em desktop amplo.
- Os testes de cards verificam a associação exclusiva de Custard a Realizado e Pupcake a Projeção, incluindo `alt=""` e `aria-hidden="true"` para ambos.
- O nome acessível de Projeção foi restaurado para `Projeção do mês`.

## TDD: RED observado

Após incluir os contratos de regressão, foi executado:

```text
npm.cmd test -- src/features/dashboard/DashboardScreen.markup.test.tsx src/features/dashboard/BalanceMoodCard.markup.test.tsx src/features/dashboard/DashboardSummaryCards.markup.test.tsx
```

Resultado: exit code `1`; 3 arquivos e 3 testes falhos.

- O teste do estado vazio recebeu `undefined` para o card de reação, confirmando que `DashboardSummaryCards` era renderizado somente no ramo `hasData`.
- O teste de layout encontrou `xl:flex-col` (e `xl:w-full`) no markup do card de reação.
- O teste de associação não encontrou o card com `aria-label="Projeção do mês"`, porque a implementação usava `Projeção no mês`.

Uma expectativa inicial do teste de estado vazio foi corrigida antes da produção para referenciar os textos existentes de `alert` (`Moranguinho atenta ao saldo baixo` e `O saldo está baixo. Vale acompanhar os próximos gastos.`), preservando o manifesto e os seis limites.

## TDD: GREEN observado

Após a alteração mínima de produção, foi executado:

```text
npm.cmd test -- src/features/dashboard/DashboardScreen.markup.test.tsx src/features/dashboard/BalanceMoodCard.markup.test.tsx src/features/dashboard/DashboardSummaryCards.markup.test.tsx src/features/dashboard/balanceMood.test.ts
```

Resultado: exit code `0`; 4 arquivos e 17 testes aprovados.

## Verificação final

| Comando | Resultado |
| --- | --- |
| `npm.cmd test` | exit code `0`; 23 arquivos e 127 testes aprovados |
| `npm.cmd run typecheck` | exit code `0` |
| `npm.cmd run lint` | exit code `0` |
| `npm.cmd run build` | exit code `0`; Vite construiu 2.851 módulos |
| `git diff --check` | exit code `0`; sem whitespace inválido |

O build emitiu o aviso não bloqueante de chunk JavaScript acima de 500 kB (`index-JYgb6148.js`, 723,74 kB); nenhuma alteração de code-splitting foi feita por estar fora do escopo.

## Arquivos alterados

- `src/features/dashboard/DashboardScreen.tsx`
- `src/features/dashboard/DashboardScreen.markup.test.tsx`
- `src/features/dashboard/BalanceMoodCard.tsx`
- `src/features/dashboard/BalanceMoodCard.markup.test.tsx`
- `src/features/dashboard/DashboardSummaryCards.tsx`
- `src/features/dashboard/DashboardSummaryCards.markup.test.tsx`
- Este relatório.

## Auto-revisão

- `balanceMoodFor`, seus seis limites e o manifesto de mensagens/alts não foram alterados.
- Custard continua exclusivo de Realizado e Pupcake de Projeção, ambos decorativos; nenhum arquivo de gráfico foi modificado.
- Não houve mudanças em banco, SQL, repositórios, cálculos, importação, Rust, `ExpensePieChart`, temas disponíveis ou `matchMedia`.
- O diff de produção contra a base contém somente os seis arquivos de dashboard desta correção; havia uma modificação pré-existente e não relacionada em `src-tauri/Cargo.toml`, que foi preservada e não será incluída no commit.

## Concerns

- O aviso de tamanho do bundle do Vite permanece, sem impacto na aprovação dos testes e fora do escopo desta onda de correções.
- Não foi iniciada uma sessão Tauri/Vite para inspeção visual, pois esta revisão vinculante foi coberta por contratos de markup e pela verificação solicitada; nenhum servidor ficou em execução.
