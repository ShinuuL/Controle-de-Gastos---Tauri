# Design — Nuvem: conta, backup cifrado e entitlement (fase 11/17)

**Data:** 2026-08-29
**Status:** Aprovado para planejamento
**Decisão desta sessão:** backend = **estender o gateway Cloudflare existente** (Workers + KV, mais R2 e D1), em vez de um serviço TypeScript separado.

## Nota de numeração

A "fase 11 — Nuvem" do ROADMAP é um stub de uma linha; a fase 17 é a versão
detalhada da mesma coisa. **São a mesma fase** e este documento vale para as
duas. O sequenciamento de 2026-08-29 (17 → 14 → 20) continua: é esta fase que
destrava Stripe e trial.

## Objetivo

Dar ao app uma conta e um backup na nuvem, sem que o servidor consiga ler
lançamento nenhum, e um entitlement que o usuário não zere reinstalando o app.

Três entregas, nesta ordem:

1. **Conta** — cadastro, login, sessão, exclusão de conta.
2. **Backup cifrado** — o `.db` sobe como arquivo opaco e volta numa reinstalação.
3. **Entitlement** — estado de pagamento lido do servidor, com carência offline.

Fora de escopo: merge de edições concorrentes entre dois aparelhos (ver
"Sincronização e conflito"), checkout do Stripe (fase 14), portões de UI das
funções pagas (fase 20), painel administrativo (fase 14b).

## O que muda em relação ao doc de arquitetura

[`docs/arquitetura-nuvem-e-distribuicao.md`](../../arquitetura-nuvem-e-distribuicao.md)
continua valendo em tudo que importa — E2E, blob cifrado em object storage,
control plane em SQL, cripto no Rust. Este documento fecha o que lá ficou aberto
e registra quatro correções de rumo:

| Ponto | Doc de arquitetura | Agora |
|---|---|---|
| Backend | serviço TypeScript separado (recomendação, não fechada) | **gateway Cloudflare existente**, um Worker só |
| Control plane | Turso/libSQL | **D1** por padrão; Turso só se o D1 apertar — mesmo SQL, uma conta a menos, mesmo ecossistema do KV já usado |
| Bytes do backup | R2 (object storage) | **KV** (decidido em 2026-08-30): o R2 exige cartão cadastrado mesmo no gratuito, e o KV entrega 25 MiB por valor sem isso. O arquivo é opaco nos dois casos |
| Canais `gated`/`direct` | dois APKs | **obsoleto** desde a fase 15 (cancelada): há um APK só |
| Entitlement | não vence (compra única) | **pode vencer**: a fase 20 traz trial de 30 dias e a fase 14 pode virar assinatura |

As duas últimas linhas obrigam a mexer em `decideAccess()` e em
`EntitlementStatus`, hoje escritos para o mundo de dois APKs e compra vitalícia.

## Modelo

O app **continua local-first e continua abrindo sem conta**. Cadastro é opcional
até a fase 20 entrar. Nada disso pode transformar "não tem internet" em "não
abre" — é critério de recusa, não preferência.

```
  app (Tauri)                      gateway (Worker)              armazenamento
  ───────────                      ────────────────              ─────────────
  SQLite local  ← fonte de leitura
      │
      │ comando Rust               /v1/auth/*         ───────▶  D1: contas, sessões
      ├── cloud_signup             /v1/backup/*       ───────▶  R2: envelope cifrado
      ├── cloud_login              /v1/me/entitlement ───────▶  D1: entitlements
      ├── cloud_backup_push        /v1/licencas/* (fase 13)     KV
      ├── cloud_backup_pull
      └── cloud_entitlement
```

Regra do AGENTS.md respeitada: **nenhum `fetch` para a nuvem no React.** Toda
chamada de rede sai do Rust, por comando tipado. O React só conhece os comandos.

## Criptografia

Envelope com duas derivações independentes, como o doc de arquitetura fixou.
Concretizando:

```
senha ──Argon2id(salt_auth)──▶ verificador ──▶ servidor (só login)
      └─Argon2id(salt_kek )──▶ KEK (fica no aparelho) ──▶ desembrulha a DEK
                                                              │
DEK aleatória de 256 bits, gerada no aparelho ─────────────────┴──▶ cifra o .db
```

| Item | Escolha |
|---|---|
| Derivação | Argon2id, `m = 64 MiB`, `t = 3`, `p = 1` — parâmetros gravados no envelope, para poderem subir sem quebrar contas antigas |
| Cifra | XChaCha20-Poly1305, nonce de 24 bytes sorteado a cada upload |
| Salts | 16 bytes aleatórios por conta, distintos para auth e KEK; guardados no servidor (não são segredo) |
| DEK embrulhada | XChaCha20-Poly1305 sob a KEK, guardada no servidor |
| Crates | `argon2`, `chacha20poly1305`, `rand`, `zeroize` — entram no `src-tauri/Cargo.toml` nesta fase |

**Trocar a senha não re-cifra o banco:** deriva a KEK nova, re-embrulha a DEK,
manda o verificador novo e o embrulho novo. Um `PUT` só.

**Perdeu a senha, perdeu o backup.** Precisa estar dito na tela de cadastro, com
confirmação explícita — não enterrado nos termos.

### Formato do envelope

O que sobe para o R2 é um arquivo único: cabeçalho binário curto + ciphertext.

| Campo | Bytes | Para quê |
|---|---|---|
| magic | 4 | `C0G1` — recusa arquivo estranho antes de tentar decifrar |
| versão do formato | 1 | permite trocar primitiva depois sem adivinhação |
| nonce | 24 | sorteado a cada upload |
| tamanho do plaintext | 8 | conferido depois de decifrar |
| ciphertext + tag | resto | o `.db` inteiro |

O `.db` é lido do disco, cifrado em memória no Rust e enviado. Cifrar em
streaming fica para quando o banco crescer o bastante para justificar; hoje ele
tem dezenas de KB.

## Control plane (D1)

```sql
accounts(id TEXT PK, email TEXT UNIQUE, verifier BLOB, salt_auth BLOB,
         salt_kek BLOB, kdf_params TEXT, wrapped_dek BLOB, created_at TEXT)
sessions(token_hash TEXT PK, account_id TEXT, expires_at TEXT, created_at TEXT)
entitlements(account_id TEXT PK, status TEXT, source TEXT, expires_at TEXT,
             payment_ref TEXT, updated_at TEXT)
backups(account_id TEXT PK, r2_key TEXT, version INTEGER, size INTEGER,
        device_id TEXT, updated_at TEXT)
audit(id INTEGER PK AUTOINCREMENT, at TEXT, actor TEXT, action TEXT,
      subject TEXT, reason TEXT)
```

- `verifier` não é a senha e não leva à KEK — salts distintos garantem isso.
- Token de sessão: 256 bits aleatórios; o servidor guarda **só o hash**.
- `entitlements` é escrito **exclusivamente** por webhook (fase 14) e pelo painel
  (fase 14b). Nunca por chamada do cliente dizendo "eu paguei".
- `audit` é append-only e registra as liberações manuais com motivo, conforme a
  seção 5 do doc de arquitetura.

## Rotas

| Rota | Entrada | Saída |
|---|---|---|
| `POST /v1/auth/params` | email | salts e kdf_params, **antes** do login |
| `POST /v1/auth/signup` | email, verificador, salts, kdf_params, wrapped_dek | token, account_id |
| `POST /v1/auth/login` | email, verificador | token, salts, kdf_params, wrapped_dek |
| `POST /v1/auth/refresh` | Bearer | token novo |
| `POST /v1/auth/logout` | Bearer | 204, sessão apagada |
| `PUT /v1/auth/password` | Bearer, verificador novo, salts, wrapped_dek novo | 204 |
| `DELETE /v1/me` | Bearer, confirmação | apaga conta, sessões e blob (LGPD art. 18) |
| `GET /v1/backup/meta` | Bearer | version, size, updated_at |
| `GET /v1/backup` | Bearer | os bytes do envelope (o KV não tem URL assinada) |
| `PUT /v1/backup` | Bearer, `If-Match: <version>`, envelope | version nova |
| `GET /v1/me/entitlement` | Bearer | status, source, expires_at |

**A rota `params` não estava neste documento e apareceu na implementação:** para
derivar o verificador é preciso o salt, e o salt só o servidor tem. Sem ela o
login é impossível. Como responder "não existe" transformaria a rota num
verificador de quem tem conta, e-mail sem cadastro recebe salts **falsos, porém
determinísticos**, derivados de `HMAC(PARAMS_SECRET, email)` — indistinguíveis
dos reais, e o login seguinte falha em `credenciais_invalidas` como qualquer
senha errada.

Notas de implementação no Worker:

- Rate limit por IP e por conta em `/v1/auth/*` — é onde se tenta senha.
- Comparação de verificador em tempo constante, como já se faz com o
  `ADMIN_TOKEN` da fase 13.
- Limite de tamanho no `PUT /v1/backup` (10 MiB para começar) e recusa de arquivo
  sem o magic correto.
- **`If-Match` é obrigatório**, e não opcional: sem ele um aparelho que ficou
  semanas offline sobrescreveria em silêncio o que o outro gravou. Ausência
  responde 428.
- Região do R2 escolhida e declarada na política (art. 33, transferência
  internacional).

## Sincronização e conflito

Sync aqui é **upload/download do arquivo inteiro**, não merge de linhas. É
consequência direta do E2E: o servidor não lê os dados, então não pode fundir
nada.

Regra desta fase, deliberadamente conservadora:

- Um `version` monotônico por conta. O `PUT` manda `If-Match` com a versão que o
  aparelho baixou; divergência devolve **409**.
- No 409 o app **não sobrescreve e não funde**: mostra as duas versões e avisa
  que restaurar antes de enviar é o único caminho que não perde um dos dois.
- **A versão base fica no banco local** (`cloud_backup_state`), não em memória:
  ela precisa acompanhar o `.db` de que saiu. Se o app perguntasse a versão
  atual ao servidor antes de enviar, todo push venceria e o `If-Match` seria
  decorativo.
- **Restaurar não escreve por cima do banco em uso.** O arquivo decifrado espera
  como `controle-de-gastos.restaurar` e a troca acontece no `setup` do Tauri,
  antes de qualquer conexão SQLite existir; o banco anterior vira
  `controle-de-gastos.anterior`. Trocar o arquivo sob uma conexão viva corrompe
  o banco de formas que só aparecem depois.
- Push automático **na abertura do app e quando ele sai de vista**
  (`visibilitychange`), no máximo uma vez por hora; pull só na restauração e
  quando o usuário pedir.

  "Ao fechar o app" virou "ao sair de vista" por dois motivos: no Android é o
  evento mais próximo disso que existe, e segurar o fechamento de uma janela de
  desktop esperando rede deixa o app parecendo travado. A abertura seguinte
  cobre o que escapar.

  A janela de uma hora não é conservadorismo: o KV gratuito dá **1.000
  escritas/dia para a conta inteira**, e push a cada mudança esgotaria isso com
  poucos usuários ativos — parando o backup de todos, não só de quem gastou.

- **Falha de push automático nunca vira tela.** Sem rede, com conflito ou com o
  servidor fora, o resultado é `adiado` e o próximo gatilho tenta de novo. Erro
  só aparece quando foi o usuário quem pediu.

**Merge de verdade continua adiado**, e continua sendo o item mais caro do
projeto. O que esta fase entrega é o caso que de fato acontece hoje — um
aparelho, reinstalação, restauração — sem inventar um merge que ninguém consegue
testar antes de existirem usuários com dois aparelhos.

## Entitlement e carência offline

`EntitlementStatus` ganha `expirado`: o trial da fase 20 vence, e a fase 14 pode
virar assinatura. O app guarda o último estado conhecido com carimbo de hora e
revalida quando há rede.

- Sem rede, o último estado vale por **7 dias**. Depois disso as funções pagas
  fecham; **o CRUD, o dashboard e os dados nunca fecham** — trancar alguém fora
  dos próprios registros financeiros está descartado.
- O estado local fica no banco (migração v5, tabela `cloud_entitlement`), não em
  `localStorage`, e vem assinado com **Ed25519** — a chave pública mora no app,
  a privada é secret do Worker. A assinatura cobre `account_id|status|expires_at|issued_at`,
  então nem editar a linha nem copiar o cache de outro aparelho funciona. A
  verificação roda **na leitura**, não só na gravação. Bypass continua possível em app
  adulterado, e isso segue aceito (doc de arquitetura, seção 3).

## Sessão e segredos no aparelho

- **Token e DEK persistidos na pasta privada do app** (`session_store.rs`),
  decidido em 2026-08-30. Não é keystore do SO porque o Tauri não tem plugin
  oficial que cubra Android — o `stronghold` exige uma senha própria (o mesmo
  problema uma camada acima) e o `keyring` só cobre desktop.

  O trade-off foi aceito de olhos abertos: é **a mesma pasta onde o `.db` já
  vive em texto puro**, então quem lê esse arquivo já lia todos os lançamentos
  direto do banco. O que continua valendo — e é o ponto do desenho — é que o
  servidor segue sem conseguir ler nada. E não é `localStorage`: aquilo estaria
  exposto a qualquer script na webview e fora do Rust.

  Endurecer depois (Keystore, DPAPI) troca só esse arquivo.
- KEK e DEK vivem só em memória no Rust, com `zeroize` na saída. Nunca cruzam a
  ponte para o JavaScript.
- A senha vai da tela direto para o comando Rust e não é guardada em lugar nenhum.

## Mudanças no que já existe

| Onde | Mudança |
|---|---|
| `src-tauri/Cargo.toml` | `argon2`, `chacha20poly1305`, `rand`, `zeroize`, cliente HTTP |
| `src-tauri/src/cloud.rs` (novo) | comandos tipados; registrar em `lib.rs` |
| `src-tauri/tauri.conf.json` | CSP `connect-src` **não muda** — a rede sai do Rust, não da webview |
| `src-tauri/capabilities/default.json` | permissão do plugin de secure storage |
| `src/lib/cloud/distribution.ts` | apagar: a fase 15 cancelou os dois APKs |
| `src/features/auth/session.ts` | `decideAccess()` perde o parâmetro `channel` e ganha `expirado` + carência |
| `src/features/auth/authClient.ts` | vira `invoke` dos comandos Rust, não `fetch` |
| `src/lib/cloud/gateway.ts` | reduzido à base URL, ou apagado |
| `src/lib/cloud/sync.ts` | estados reais + os dois comandos |
| `gateway/` (deploy-base, fora deste repo) | rotas novas, bindings de R2 e D1 — **versionar antes**, é a pendência 5 do ROADMAP |

## Verificação

- **Rust:** round-trip do envelope; senha errada falha na tag AEAD e não devolve
  lixo; troca de senha preserva a DEK; parâmetros de KDF antigos continuam
  decifrando; magic inválido recusado.
- **TS:** `decideAccess()` com trial vencido, carência dentro e fora do prazo,
  sessão expirada, sem conta; estados de sync incluindo o 409.
- **Gateway:** signup/login/refresh/logout, verificador errado, `If-Match`
  divergente devolvendo 409, limite de tamanho, `DELETE /v1/me` apagando blob e
  conta, rate limit.
- **Ponta a ponta:** cadastrar, gravar movimentações, subir, desinstalar,
  reinstalar, entrar, restaurar, conferir que os lançamentos batem.
- **Modo avião:** app abre, lê e grava normalmente com conta cadastrada.

## Ordem de implementação

1. ~~Versionar o `gateway/`~~ — já estava feito (verificado em 2026-08-29).
2. ~~Cripto no Rust, testada isolada, sem rede~~ — `src-tauri/src/crypto.rs`, 20 testes (2026-08-29).
3. ~~D1 + rotas de auth no Worker; comandos `cloud_signup`/`cloud_login`; tela de conta~~
   — entregue em 2026-08-29, **menos** a persistência do token (acima) e a
   criação dos recursos na Cloudflare (D1, R2, KV e `PARAMS_SECRET`), que
   dependem de você rodar os `wrangler` do `gateway/wrangler.toml`.
4. ~~R2~~ **KV** + rotas de backup; `cloud_backup_push`/`pull`; restauração
   pós-reinstalação — entregue em 2026-08-30. Falta você criar o namespace
   (`npx wrangler kv namespace create BACKUPS`), colar o id no `wrangler.toml` e
   fazer deploy.
5. ~~`/v1/me/entitlement` e a carência~~ — entregue em 2026-08-29. Falta você
   rodar `node scripts/gerar-chave-entitlement.mjs` no gateway, pôr a privada em
   `wrangler secret put ENTITLEMENT_KEY` e a pública em `CHAVE_ENTITLEMENT`
   (`src-tauri/src/cloud.rs`). Sem o par o app funciona, mas **não há carência
   offline** — nada conta como verificado, que é o comportamento correto.
6. LGPD (fase 15b): política, termos, `DELETE /v1/me` verificado, aviso de perda de senha.

Os itens 5 e 6 são o que libera as fases seguintes; 1–4 são pré-requisito deles.

## Pendências que este documento não resolve

- **Compra única vs. assinatura** (fase 14) precisa ser decidida antes de criar o
  produto no Stripe; muda se `expires_at` do entitlement é usado de verdade.
- **Região do R2** e o texto de transferência internacional.
- **Domínio próprio** (fase 14): webhooks e e-mail transacional dependem dele.
