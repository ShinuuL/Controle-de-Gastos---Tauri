# Controle de Gastos

Aplicativo desktop e mobile para controle financeiro pessoal, construído com Tauri 2, React 19 e SQLite local.

## Tech Stack

- **Frontend:** React 19 + TypeScript strict + Tailwind CSS 4
- **Backend:** Rust (Tauri 2)
- **Banco:** SQLite via `@tauri-apps/plugin-sql`
- **Gráficos:** Recharts
- **Gerenciador de pacotes:** npm

## Comandos

### Desenvolvimento

| Comando | Descrição |
|---------|-----------|
| `npm run tauri dev` | App desktop completo (frontend + Rust + SQLite) |
| `npm run dev` | Só o Vite (porta 1420) — sem backend, plugin-sql não funciona |
| `npm run build` | Build de produção (`tsc && vite build`) |

### Android

| Comando | Descrição |
|---------|-----------|
| `npm run tauri android dev` | App Android em modo dev (conectado ao dispositivo) |
| `npm run tauri android build -- --target aarch64` | Build APK para arm64 (release) |
| `npm run tauri android build -- --target armv7` | Build APK para armv7 (release) |

### Verificação

| Comando | Descrição |
|---------|-----------|
| `npm run lint` | Lint com oxlint |
| `npm run typecheck` | Typecheck com `tsc --noEmit` |
| `npm test` | Testes unitários com vitest |
| `cd src-tauri && cargo check` | Verificação Rust |
| `cd src-tauri && cargo test` | Testes Rust |

## Arquitetura

- **Tela Dashboard (Resumo):** Visão completa de todas as movimentações — cards Realizado/Projeção, gráfico de rosca por categoria, breakdown detalhado
- **Tela Movimentações:** CRUD completo de transações com filtro por categoria e mês
- **Tela Categorias:** Gerenciamento de categorias com orçamento mensal e barra de progresso
- **Banco SQLite:** Schema versionado via migrations Rust (`src-tauri/src/migrations.rs`). Auto-migração no update do app — não apaga dados existentes

## Estrutura do Projeto

```
src/
├── features/
│   ├── dashboard/      # Tela Resumo (Dashboard)
│   ├── transactions/   # Tela Movimentações + formulário + resumo
│   └── categories/     # Tela Categorias + progresso de orçamento
├── components/
│   └── layout/         # AppShell, Sidebar, BottomNav
└── lib/
    ├── repositories/   # Acesso ao banco (transactions, categories)
    ├── observability/  # Telemetria em memória (sem envio remoto)
    ├── types.ts        # Tipos de domínio
    ├── currency.ts     # Formatação BRL
    └── db.ts           # Singleton SQLite

src-tauri/
├── src/
│   ├── main.rs         # Entry point Tauri
│   ├── lib.rs          # Builder com plugin-sql + migrations
│   └── migrations.rs   # Schema versionado (v1: tabelas, v2: triggers)
└── capabilities/       # Permissões Tauri
```

## Regras de Negócio

- Interface e valores em pt-BR e BRL
- Valores monetários em centavos (inteiros)
- Datas no formato ISO `YYYY-MM-DD`
- IDs em UUID
- Categorias predefinidas são protegidas
- Orçamento mensal por categoria: `null` ou centavos positivos
