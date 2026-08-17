# Política de desenvolvimento

## Autorização

Agentes não podem criar, editar ou excluir código, configuração, dependências, migrações ou documentação sem aprovação direta do desenvolvedor para o escopo e a fase exatos. Inspeção e verificação somente leitura são permitidas. Esta solicitação direta de endurecimento está autorizada para este escopo.

## Escopo de arquivos

- Agentes NÃO podem criar, editar ou excluir arquivos fora da raiz do projeto (D:\Dev\Controle de gastos) sem permissão explícita do desenvolvedor. Isso inclui worktrees git, clones, diretórios temporários e qualquer caminho fora da raiz.
- Não criar worktrees git fora da raiz. Se isolamento for necessário, usar apenas dentro da raiz ou pedir permissão.
- Antes de qualquer operação que escreva fora da raiz (ex.: git worktree add, cópia de arquivos), pedir aprovação explícita.

## Comandos

- `npm run tauri dev` — aplicativo desktop completo (frontend + Rust + SQLite). Use para validar fluxos com banco.
- `npm run dev` — só o Vite (porta fixa 1420, strictPort); sem o backend Tauri, `plugin-sql` não funciona.
- Para iniciar o Vite em background (Windows), usar `npm --prefix "D:\Dev\Controle de gastos" run dev` — NUNCA `cd "..." ; npm run dev` (o harness duplica aspas no caminho com espaço) nem `npm run dev` sem cd (roda no diretório errado).
- Antes de iniciar, verificar se a porta 1420 está livre: `netstat -ano | findstr :1420`. Se houver processo node/vite LISTENING, matar com `taskkill /PID <PID> /F` antes de iniciar (processos órfãos seguram a porta).
- Ao terminar a verificação visual, derrubar o servidor Vite iniciado (não deixar órfão).
- `npm run build` — `tsc && vite build` (inclui typecheck). `npm run typecheck` — só `tsc --noEmit`.
- `npm run lint` — `oxlint` (sem config, padrões). `npm test` — `vitest run`, ambiente node, sem runtime Tauri.
- Rust: `cd src-tauri && cargo check` / `cargo test`.
- Checklist de release (SECURITY.md): testes → lint → build → `npm audit --omit=dev --audit-level=high` → `cargo check` → `git diff --check`.

## Arquitetura

- Tauri 2 + React 19 + TypeScript strict + Tailwind CSS 4 (plugin `@tailwindcss/vite`) + SQLite via `@tauri-apps/plugin-sql`. Gerenciador de pacotes: npm.
- Autoridade do esquema: migrações Rust em `src-tauri/src/migrations.rs` (registradas em `lib.rs`). O frontend nunca cria/altera tabelas — mudança de esquema = nova migração versionada.
- Acesso ao banco somente via repositórios em `src/lib/repositories/` (`categories.ts`, `expenses.ts`, `transactions.ts`, `presets.ts`), usando `getDb()` de `src/lib/db.ts` (singleton lazy: `PRAGMA foreign_keys = ON` + seed das categorias predefinidas quando a tabela está vazia).
- Não existe tabela `transactions`: o tipo `Transaction` lê da tabela `expenses`, que tem colunas `nature` ('entrada'/'saida') e `status` ('previsto'/'realizado'). A tela de despesas (`ExpensesScreen`) é legado e filtra `nature = 'saida' AND status = 'realizado'`; o modelo de transações está em introdução (tipos, repositório e helpers existem, a UI ainda usa `ExpensesScreen`).
- SQL parametrizado com placeholders `$1, $2, ...` (sintaxe do plugin-sql) — nunca `?` nem interpolação de strings.
- Validação com mensagens de erro em pt-BR mora no repositório; o banco reforça `amount_cents` inteiro positivo via triggers da migração v2.
- Toda operação de repositório é envolvida por `traceOperation` (telemetria em memória, sem envio remoto); para métricas, o nome da operação precisa estar no allowlist `METRIC_OPERATIONS` em `src/lib/observability/telemetry.ts`.
- Datas: ISO `YYYY-MM-DD`; consultas mensais usam intervalo `[início, início do próximo mês)` via `monthRange`.

## Armadilhas

- O teste Rust `migrations_enforce_positive_expense_amounts_without_rebuilding_expenses` (em `migrations.rs`) asserta `migrations().len() == 2` — adicionar migração exige atualizar o teste.
- Porta 1420 fixa (strictPort); HMR usa 1421 quando `TAURI_DEV_HOST` está definido. O Vite ignora `src-tauri` no watch.
- Testes unitários mockam `../db` com `vi.mock` + fake DB (`select`/`execute`); novos testes ficam colocalizados (`*.test.ts`).
- Capacidade Tauri em `src-tauri/capabilities/default.json`: `sql:default` + `sql:allow-execute` — novos plugins/comandos exigem permissão correspondente.
- Banco (`*.db`, `*.sqlite`) e `dist/` não são commitados; o arquivo do banco é criado pelo plugin em tempo de execução, fora do repositório.
- CSP restritiva em `tauri.conf.json` (produção e dev): `script-src 'self'` — nada de scripts inline.
- Porta 1420 pode ficar presa por processos Vite órfãos de sessões anteriores — sempre checar com `netstat` antes de iniciar o dev server.

## Regras de negócio

- Interface e valores usam pt-BR e BRL; valores monetários são inteiros em centavos.
- Datas são ISO `YYYY-MM-DD`, sem horário.
- SQLite é local agora; uma futura nuvem deve usar comandos Rust tipados como autoridade do banco.
- IDs usam UUID. Despesa exige valor positivo, categoria existente e data válida.
- Categorias predefinidas são protegidas. Categoria personalizada com despesas não pode ser excluída.
- Orçamento mensal de categoria é `null` ou centavos positivos. Não há parcelas ou recorrência.
- O dashboard agrupa fatias de forma acessível e fornece alternativa acessível quando necessário.

## Segurança e observabilidade

- Use apenas SQL parametrizado. Não registre segredos ou dados financeiros pessoais.
- Use o repositório e não adicione telemetria remota sem aprovação explícita e comandos de verificação exatos.
- Telemetria é apenas em memória e sanitizada (`src/lib/observability/`): sem crash SDK, analytics, endpoint HTTP ou persistência de diagnósticos.
