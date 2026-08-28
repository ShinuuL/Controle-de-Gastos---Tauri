# Roadmap — Controle de Gastos

**Status geral:** Fase 9 (Migração do legado) concluída (2026-08-17). Próximas fases pendentes.

---

## Fases

| # | Fase | Status | Descrição | Evidência |
|---|------|--------|-----------|-----------|
| 1 | Scaffold | ✅ Concluída | Tauri 2 + React 19 + TS strict + Tailwind 4 + SQLite (plugin-sql) | App inicial com build passando |
| 2 | UI Shell | ✅ Concluída | Tokens de tema (dark/light), shell responsivo com sidebar desktop e bottom nav mobile | — |
| 3 | Dashboard | ✅ Concluída | Totais mensais + gráfico de rosca por categoria | — |
| 4 | Expense CRUD | ✅ Concluída | CRUD de despesas, modal de formulário, filtro por categoria, confirmação de exclusão | — |
| 5 | Budgets | ✅ Concluída | Orçamento mensal por categoria + barra de progresso de gastos | — |
| 6 | Hardening + Observabilidade | ✅ Concluída | Endurecimento de dados locais + telemetria privada em memória (`traceOperation`, `METRIC_OPERATIONS`) | — |
| 7 | Android | ✅ Concluída | Projeto Tauri Android + preparação de assinatura de release | — |
| 8 | Transactions | ✅ Concluída | Modelo de transações: contratos de domínio, cálculo de resultado mensal (realizado/projeção), repositório CRUD completo (list com JOIN, create, update, delete, traceOperation), tela de Movimentações + 4ª aba | 69 testes TS + 1 Rust, critic APPROVED, vision PASS |
| 9 | Migração do legado | ✅ Concluída | Migração de Dashboard e CategoriesScreen do repositório expenses legado para modelo de transações | 60 testes TS + 1 Rust, lint/typecheck limpos, vision pendente |

> **Nota sobre numeração:** As fases 1–7 seguem a ordem cronológica dos commits (2026-08-15). "Transactions" foi internamente chamada de "Fase 5" durante o desenvolvimento, mas corresponde à 8ª entrega cronológica.

---

## Próximos passos

### Fase 9 — Migração do legado (concluída)

Migração de Dashboard e CategoriesScreen do repositório `expenses` legado para o modelo de transações.

Itens:
- **Dashboard:** decidir semântica — entradas entram como `nature = 'entrada'`? previstos (`status = 'previsto'`) aparecem nas projeções? A função `calculateMonthlyResult` já retorna `realized`/`projected`; integrar ao dashboard.
- **CategoriesScreen:** migrar para ler do modelo de transações ao invés de `expenses` diretamente.
- **ExpensesScreen:** descontinuar (ou redirecionar para `TransactionsScreen`). Atualmente filtra `nature = 'saida' AND status = 'realizado'` — comportamento já coberto pela tela de Movimentações.
- **Documentar decisões de produto** no `MEMORY.md` ou `NOTES.md` conforme tomadas.

### Fase 10 — Importação e conciliação de extratos (planejada)

Importação manual, local e revisável de extratos bancários, em substituição ao escopo inicial de integrações externas (Open Finance e carteira digital).

Primeiro recorte aprovado:
- Extrato de conta-corrente Itaú em CSV, processado somente no dispositivo.
- Prévia para revisar natureza e categoria de entradas e saídas antes de gravar.
- Deduplicação determinística e sinalização de conflitos parecidos para decisão manual.
- Criação de categoria somente se o arquivo a fornecer e o usuário mantiver a sugestão.

Fora deste recorte: cartão de crédito, OFX, PDF/XLS, outros bancos e categorização automática a partir do histórico.

Design aprovado: `docs/superpowers/specs/2026-08-24-importacao-csv-itau-design.md`.

### Fase 11 — Nuvem (futuro, não iniciado)

SQLite é local. Futura sincronização nuvem deve usar comandos Rust tipados como autoridade do banco. Evitar misturar acesso local e remoto no frontend.

---

## Distribuição comercial (planejado — desenho aprovado, não implementado)

Desenho completo em [`docs/arquitetura-nuvem-e-distribuicao.md`](docs/arquitetura-nuvem-e-distribuicao.md).
Placeholders inertes já criados em `src/lib/cloud/` e `src/features/auth/`.

### Fase 12 — Reparo de migração quebrada (✅ concluída em 2026-08-27)

Aparelhos que instalaram um build com a migração
`v1` editada não abrem mais: o `sqlx` detecta `VersionMismatch(1)` dentro de
`Database.load()`, antes de qualquer tela renderizar. Subir o banco para a nuvem
**não** resolve esses aparelhos — o erro ocorre antes de qualquer código de rede
rodar, e sem o app abrir o usuário não chega à tela de login para restaurar nada.

Entregue:
- **`preload` removido do `tauri.conf.json`.** Era ele que fazia a migração rodar no setup do plugin Rust, onde a falha abortava a inicialização e a webview nunca carregava — tela de reparo em React seria impossível. Sem ele, a migração roda em `Database.load()` e o erro chega ao JS.
- `src-tauri/src/recovery.rs`: diagnóstico e reparo por *stamping*. Corrige o checksum registrado quando o schema comprova que a migração já foi aplicada; **não reescreve dados**. Backup do `.db` antes de qualquer escrita, e recusa reparar se o estado não for o previsto.
- `src/lib/dbFailure.ts`: classifica a falha (`migracao-divergente`, `migracao-ausente-no-codigo`, `desconhecida`) a partir das mensagens do sqlx.
- `src/features/recovery/DatabaseRecoveryScreen.tsx` + portão de boot no `App.tsx`.
- 7 testes Rust e 5 TS, incluindo o cenário da população quebrada de ponta a ponta.

**Validado em aparelho real (2026-08-27):** instalado por cima de um aparelho da
população B, o app abriu na tela de reparo em vez de morrer no boot, o reparo
rodou e após reiniciar o app voltou ao normal com os dados preservados.

**Regra permanente:** migração aplicada nunca é editada, só nova versão. Editar
a v1 depois de distribuída foi a causa desta fase inteira.

### Fase 13 — Contas e login

Conta única entre a landing page e o app. Regra de liberação já implementada e
testada em `decideAccess()` (`src/features/auth/session.ts`).

Itens:
- Backend `/v1/auth/login`, `/v1/auth/refresh`, `/v1/me/entitlement`.
- Token em secure storage do SO — nunca `localStorage`.
- Tela de login exibida apenas no canal `gated`.
- Liberar o domínio da API em `connect-src` na CSP.

### Fase 14 — Pagamento e entitlement

**Compra única, sem assinatura** (decidido em 2026-08-27). O entitlement não
vence: a única forma de perder acesso é estorno. Isso elimina a questão de
"trancar o usuário fora dos próprios dados quando a assinatura vence", que era
o ponto mais delicado do desenho local-first.

Itens:
- Escolher Stripe ou PIX. Sem recorrência, o PIX fica mais atraente (taxa ~4x menor); o custo é tornar a fase 14b obrigatória.
- `entitlement` gravado apenas por **webhook** ou por **liberação manual no painel** (fase 14b) — nunca por chamada do cliente.
- Estados: `ativo` / `pendente` / `revogado` / `ausente`, com campo `origin` (`webhook` | `manual`).
- Tratar estorno: MED no PIX, contestação no cartão → `revogado`.
- Modelo local-first confirmado: bypass do cliente é possível e aceito.

### Fase 14b — Painel administrativo (obrigatória se o pagamento for PIX)

Existe porque no PIX o dinheiro pode entrar sem o entitlement liberar: QR
estático não notifica, e webhook de PSP pode falhar, chegar fora de ordem ou
trazer valor/conta divergente. Sem esta tela, o usuário pagou e ficou travado, e
o único caminho seria editar o banco à mão.

Itens:
- Fila de reconciliação: contas pendentes com pagamento recebido, e pagamentos sem conta identificada.
- `POST /v1/admin/entitlement` com justificativa obrigatória e referência do pagamento.
- Log de auditoria append-only (quem liberou, quando, qual pagamento, por quê).
- Autenticação separada da conta de usuário comum + segundo fator; rotas `/v1/admin/*` isoladas e negadas por padrão.
- Painel não servido junto da landing page pública.
- Mora no site, não neste repositório: o app não precisa de nenhuma mudança.

### Fase 15 — Dois APKs

Itens:
- `VITE_DISTRIBUTION=gated` (site, com login) e `direct` (distribuição própria, sem login).
- `applicationId` distinto por canal, se os dois precisarem coexistir no mesmo aparelho.
- Dois artefatos no `deploy.toml`, hoje com apenas um bloco `[[artifact]]`.

### Fase 15b — LGPD (bloqueia a cobrança do primeiro cliente)

Ver seção 6 de [`docs/arquitetura-nuvem-e-distribuicao.md`](docs/arquitetura-nuvem-e-distribuicao.md).
Hoje a exposição é zero porque nada sai do aparelho; a nuvem muda isso de patamar.

**E2E aprovado em 2026-08-27.** Custo aceito: perdeu a senha, perdeu o backup —
precisa estar visível no cadastro, não enterrado nos termos.

Itens:
- Esquema de envelope (seção 7 do doc): Argon2id com salts distintos para verificador de login e KEK; DEK aleatória cifrando o banco; DEK embrulhada pela KEK no servidor. Trocar senha re-embrulha a DEK, não re-cifra os dados.
- Cripto em Rust (`argon2`, `chacha20poly1305`) dentro do `src-tauri` — nenhuma dependência de cripto existe hoje no `Cargo.toml`.
- Base legal: execução de contrato (art. 7º), não consentimento.
- Minimização: só email, `user_id` e referência de pagamento.
- Endpoint real de eliminação de conta, junto com o de cadastro.
- Transferência internacional (art. 33) se o backend for Cloudflare/Turso.
- Política de privacidade e termos antes do primeiro cadastro real.
- Canal de contato do titular (art. 41; Resolução CD/ANPD nº 2/2022 simplifica DPO para pequeno porte).
- Revisão por advogado antes de cobrar do primeiro cliente.

### Fase 16 — Landing page e release

Itens:
- Página de apresentação com download e checkout.
- `portal/index.html` do deploy-base tem `GATEWAY` fixo no código e rotula todo artefato como "instalador" — precisa tratar `kind = "apk"`.
- Publicação via `deploy.toml` (já criado na raiz; `repo`, `gateway` e chaves ainda com placeholder).

### Fase 17 — Sincronização em nuvem

**Turso/libSQL aprovado em 2026-08-27, com um ajuste:** o sync nativo do libSQL
(embedded replica) opera no nível das linhas e exige que o servidor leia os
dados — incompatível com E2E. Ver seção 7 do doc. Divisão resultante:

- **Object storage (R2/S3):** o `.db` cifrado do usuário, como arquivo opaco.
- **Turso:** control plane — contas, entitlements, pagamentos, auditoria do painel. É aqui que o SQL rende.

Itens:
- Modelo local-first: SQLite continua sendo a fonte de leitura, nuvem é réplica e restauração.
- Sincronização por comandos Rust tipados, conforme AGENTS.md — não como segundo caminho de leitura no React.
- Backend em TypeScript (recomendado, não fechado): o serviço é pequeno porque não há lógica sobre dados que o servidor não consegue ler.
- Recuperação pós-reinstalação.
- **Modelo de resolução de conflito: adiado deliberadamente para esta fase** (decidido em 2026-08-27). Dois aparelhos editando offline na mesma conta é a parte mais cara do projeto, e desenhá-la antes de existir backend seria especular. Fica registrado como risco conhecido, não como esquecimento.

---

## Notas de arquitetura

- **Não há tabela `transactions` no banco.** O tipo `Transaction` lê da tabela `expenses`, que tem colunas `nature` (`'entrada'`/`'saida'`) e `status` (`'previsto'`/`'realizado'`). Essa é a arquitetura atual e não deve ser alterada sem nova migração.
- **`ExpensesScreen`** é legado: filtra `nature = 'saida' AND status = 'realizado'`. A tela de Movimentações (`TransactionsScreen`) cobre o mesmo escopo com mais funcionalidade.
- **Banco dev antigo:** ao recriar o schema (ex.: durante migrações), o arquivo `.db` antigo deve ser apagado para que o plugin recrie com o schema atualizado incluindo `nature`/`status`.
- **Testes de componente/UI** (opcional, não planejado): hoje a UI é verificada via typecheck + build + passada visual (vision). Não há infra de jsdom/testing-library. Considerar se a complexidade da UI justificar.
