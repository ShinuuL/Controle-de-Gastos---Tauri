# MEMORY.md

## Architecture Decisions

- **Dashboard semântica:** Dashboard mostra TODAS as transações (entradas + saídas, realizados + previstos). Cards "Realizado" e "Projeção" usam `calculateMonthlyResult`. Gráfico de rosca usa `Math.abs()` para valores mistos.
- **ExpensesScreen removida:** A aba "Despesas" foi removida do AppShell. TransactionsScreen é o superset completo. Não há mais referências ao repositório `expenses` no código.
- **Auto-migração SQLite:** O `tauri-plugin-sql` já trata auto-migração. Novas migrations em `migrations.rs` são aplicadas automaticamente ao atualizar o app. Não é necessário apagar o banco.
- **Categories budget progress:** Filtro `e.nature = c.nature` adicionado ao LEFT JOIN para garantir que categorias de saida só somam despesas de saida, e categorias de entrada só somam receitas de entrada.

## Rules

- Dashboard sempre mostra visão completa (todas as naturezas e status)
- Transações são a fonte única de verdade para dados financeiros
- O repositório `expenses` foi deletado — não recriar
