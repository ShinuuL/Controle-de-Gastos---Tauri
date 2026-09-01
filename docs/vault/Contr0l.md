# Contr0l

> [!info] Página mãe: [[Portal Geral]] · `D:\Dev\Desenvolvimento\Projetos\portal-geral\MOTHER.md`

> [!note] Esta é a cópia de origem da nota do vault, publicada em
> `D:\Dev\Desenvolvimento\Projetos\Contr0l.md` em 2026-09-01. Vive aqui para
> andar junto do código; ao mudar algo relevante, atualizar as duas.

## Objetivo
Controle de gastos que roda no aparelho. Lançamentos, resultado mensal
(realizado e projeção), orçamento por categoria e importação de extrato — tudo
lido e gravado localmente, sem conta e sem internet. Backup na nuvem é opcional
e sobe cifrado no próprio aparelho.

## Status
🚧 v0.5.0 publicada em `ShinuuL/Releases` (tag `contr0l-v0.5.0`) via [[deploy-base]],
com APK (84 MB) e instalador Windows (8,6 MB). Nuvem e atualização pelo app com
o código pronto, esperando validação em aparelho.

## Tecnologias
- [[Tauri]] 2 · [[Rust]] · [[React]] 19 · [[TypeScript]] · [[Tailwind]] 4 · [[SQLite]]
- [[Android]] (APK fora da Play Store) · [[Cloudflare Worker]] · [[D1]] · [[KV]]
- [[Ed25519]] · [[Argon2id]] · XChaCha20-Poly1305
- [[Git]] · [[deploy-base]] · [[Vitest]]

## Funcionalidades
- [x] CRUD de movimentações (entrada/saída, previsto/realizado) e categorias
- [x] Dashboard com resultado do mês e rosca por categoria
- [x] Orçamento mensal por categoria com barra de progresso
- [x] Importação de extrato: CSV do Itaú e do Nubank, PDF de qualquer banco
- [x] Conciliação: duplicata por identificador do banco e conflito por valor + ±3 dias
- [x] Tema moranguinho (estampa vetorial no desktop, bitmap no celular)
- [x] Reparo de migração quebrada na abertura
- [x] Conta na nuvem: backup cifrado, entitlement assinado, exclusão de conta (LGPD art. 18)
- [x] Atualização pelo app: manifesto assinado + sha256 + instalador do sistema
- [ ] Validação em aparelho real da nuvem e da atualização
- [ ] Trial de 30 dias e funções pagas (fase 20)

## Arquitetura
**Nada de dado financeiro sai do aparelho em claro.** SQLite local é a fonte de
leitura; a nuvem é réplica opaca.

- `src/features/` — dashboard, transactions, categories, imports, auth, update, recovery
- `src/lib/repositories/` — acesso ao SQLite via `tauri-plugin-sql`
- `src-tauri/src/` — `crypto.rs` (envelope), `cloud.rs` (conta e backup), `update.rs`
  (manifesto assinado), `instalador.rs` (ponte Android), `recovery.rs`, `migrations.rs`
- `src-tauri/gen/android/.../InstaladorPlugin.kt` — plugin Kotlin do instalador
- `landing/` — página de download, política de privacidade e termos

Specs em `docs/superpowers/specs/`; deploy do Worker em `docs/deploy-do-gateway.md`.

## Decisões Técnicas
- **Toda chamada de rede sai do Rust**, nunca do React: senha, KEK, DEK e token
  de sessão nunca existem no heap do JavaScript.
- **Um parser de CSV por banco** (`itauCsv.ts`, `nubankCsv.ts`), com o banco
  detectado pelo delimitador antes de qualquer valor ser lido: "1.234" vale
  R$ 1.234,00 no Itaú e R$ 1,23 no Nubank, e adivinhar erraria por 1000x em silêncio.
- **Não há tabela `transactions`** — o tipo lê da tabela `expenses`, com colunas
  `nature` e `status`.
- **Migração aplicada nunca é editada**, só nova versão. Editar a v1 depois de
  distribuída custou uma fase inteira de reparo.
- **A canonicalização do manifesto de update é escrita à mão** para bater byte a
  byte com o `json.dumps(sort_keys=True, ...)` do [[deploy-base]].

## Problemas
- Importação do Nubank falhava no aparelho e passava no teste: era a conciliação
  fazendo uma consulta por linha (70 idas de IPC), não o parser.
- `catch {}` engolindo a causa custou horas de diagnóstico — no aparelho não há console.
- Comentário XML não aceita dois hifens seguidos: quebrou o SVG da estampa em silêncio.

## Repositório
`D:\Dev\Desenvolvimento\Projetos\Controle de gastos` · binários em `ShinuuL/Releases`
· gateway em `D:\Dev\Desenvolvimento\Projetos\deploy-base\gateway`
