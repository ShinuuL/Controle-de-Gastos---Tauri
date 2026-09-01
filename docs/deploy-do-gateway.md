# Deploy do gateway (Worker da nuvem)

Passo a passo para publicar o `updates-gateway`, que serve **três coisas**:
download assinado das releases (fases 13 e 16), contas e backup cifrado do
Contr0l (fase 11/17) e as rotas de administração de licenças.

O código **não mora neste repositório**. Ele fica em `deploy-base`, e na máquina
atual está em `d:/Dev/Desenvolvimento/Projetos/deploy-base/gateway`. Todos os
comandos abaixo rodam **de dentro de `gateway/`** — é lá que está o
`wrangler.toml`, e sem ele o wrangler não sabe nem o nome do Worker.

---

## Estado verificado em 2026-09-01

Antes de seguir a receita: a maior parte dela **já está feita**. Isto foi
conferido contra a Cloudflare de verdade, não contra o roadmap:

| Item | Estado |
|---|---|
| Autenticação do wrangler | ✅ logado (`npx wrangler whoami`) |
| D1 `contr0l-cloud` | ✅ criado, `database_id` no `wrangler.toml` |
| Schema 001 (`schema.sql`) | ✅ aplicado — `accounts`, `sessions`, `entitlements`, `audit` |
| **Migração 002** (`schema-002-backups.sql`) | ✅ **aplicada** — `backups` já tem `blob_key`, não `r2_key` |
| KV `LICENSES`, `BACKUPS`, `AUTH_RATE` | ✅ criados, ids no `wrangler.toml` |
| Secrets | ✅ `ADMIN_TOKEN`, `ENTITLEMENT_KEY`, `GITHUB_TOKEN`, `PARAMS_SECRET` |
| Worker publicado | ✅ último deploy em 2026-08-31, depois do commit `c059c6a` |
| `DELETE /v1/me` | ✅ **existe e está no ar** (responde 401 sem token, 400 sem `{"confirmacao":"APAGAR"}`) |
| Testes do gateway | ✅ 50 passando (`npx vitest run` em `gateway/`) |
| `PAID_APPS` | vazio de propósito — o bloqueio de download está desligado (fase 13) |

Ou seja: **não falta deploy para a exclusão de conta funcionar.** O contrato que
o app usa (`{"confirmacao":"APAGAR"}` no corpo do `DELETE /v1/me`) é exatamente o
que o Worker publicado exige. O que falta é o teste de ponta a ponta com um
aparelho de verdade.

---

## Deploy de rotina (o caso normal)

É o que você roda depois de mexer no código do gateway.

```bash
cd d:/Dev/Desenvolvimento/Projetos/deploy-base/gateway

npx vitest run          # 1. os testes primeiro: o Worker não tem staging
npx wrangler deploy     # 2. publica
curl -s https://updates-gateway.sofaltaumaletr.workers.dev/health   # 3. {"ok":true}
```

Depois de publicar, rode a verificação de fumaça da seção seguinte. Ela é curta
e pega o erro que mais dói: rota que subiu sem o binding que ela usa.

> **Commite antes de publicar.** O que está no ar precisa existir no git; senão
> a única cópia do que os usuários estão usando é a pasta desta máquina.

---

## Verificação de fumaça (sem conta, sem risco)

Nenhum destes comandos escreve nada. Substitua `$G` pela URL do gateway.

```bash
G=https://updates-gateway.sofaltaumaletr.workers.dev

curl -s -o /dev/null -w "health        %{http_code}\n" $G/health
# 200

curl -s -o /dev/null -w "manifesto     %{http_code}\n" $G/v1/apps/contr0l/latest
# 200 -- download e assinatura de release seguem de pé

curl -s -X POST -H "content-type: application/json" \
     -d '{"email":"nao-existe-mesmo@exemplo.com"}' $G/v1/auth/params
# 200 com salts. Se der 503 "params_secret_ausente", o secret PARAMS_SECRET caiu.
# E-mail sem cadastro TEM de responder 200 com salts falsos: é o que evita a rota
# virar um verificador de quem tem conta.

curl -s -o /dev/null -w "backup        %{http_code}\n" $G/v1/backup
curl -s -o /dev/null -w "entitlement   %{http_code}\n" $G/v1/me/entitlement
curl -s -o /dev/null -w "apagar conta  %{http_code}\n" -X DELETE $G/v1/me
# 401 nos três. 401 é a resposta certa: a rota existe e exige sessão.
# 404 aqui significaria que o deploy subiu sem as rotas da nuvem.
# 503 "d1_ausente" significaria binding de D1 faltando no wrangler.toml.
```

Interpretação rápida dos códigos que aparecem quando algo está errado:

| Resposta | O que caiu |
|---|---|
| `503 d1_ausente` | bloco `[[d1_databases]]` comentado ou sem `database_id` |
| `503 params_secret_ausente` | secret `PARAMS_SECRET` não existe neste Worker |
| `404` numa rota `/v1/auth/*`, `/v1/me*`, `/v1/backup` | deploy antigo, sem o código da nuvem |
| `405 method_not_allowed` | o prefixo da rota não está na lista de rotas que escrevem (`auth`, `me`, `backup`, `admin`) |
| `500` em `/v1/backup` | binding KV `BACKUPS` ausente |

---

## Do zero (só se precisar recriar a infraestrutura)

Esta é a sequência completa, na ordem em que as dependências exigem. Ela já foi
executada; serve para uma conta nova, outro ambiente ou desastre.

```bash
cd .../deploy-base/gateway

# 1. Entrar na conta Cloudflare
npx wrangler login
npx wrangler whoami                       # confirme a conta certa

# 2. D1 (control plane: contas, sessões, entitlements, auditoria)
npx wrangler d1 create contr0l-cloud      # imprime o database_id
#    -> cole o id em [[d1_databases]] no wrangler.toml

# 3. KV
npx wrangler kv namespace create BACKUPS    # bytes do backup cifrado
npx wrangler kv namespace create AUTH_RATE  # contagem de tentativas de login
npx wrangler kv namespace create LICENSES   # chaves de licença (fase 13)
#    -> cole cada id no bloco [[kv_namespaces]] correspondente

# 4. Schema -- só agora, porque o d1 execute precisa do database_id preenchido
npx wrangler d1 execute contr0l-cloud --file=schema.sql --remote
npx wrangler d1 execute contr0l-cloud --file=schema-002-backups.sql --remote

# 5. Secrets (nenhum deles vai para o wrangler.toml, nunca)
npx wrangler secret put PARAMS_SECRET     # aleatório longo; gera os salts falsos
npx wrangler secret put GITHUB_TOKEN      # PAT fine-grained, só leitura de Contents
npx wrangler secret put ADMIN_TOKEN       # quem tem isto emite licença de graça
node scripts/gerar-chave-entitlement.mjs  # imprime o par Ed25519
npx wrangler secret put ENTITLEMENT_KEY   # a PRIVADA aqui
#    -> a PÚBLICA vai para CHAVE_ENTITLEMENT em src-tauri/src/cloud.rs

# 6. Publicar
npx wrangler deploy
```

**A ordem entre 4 e 2 não é estética:** `d1 execute` precisa do `database_id` no
arquivo para saber em qual banco rodar. Rodar o schema antes de colar o id falha
de um jeito que parece problema de permissão.

**Trocar o par de entitlement invalida todo cache offline** nos aparelhos. Eles
voltam a precisar de rede uma vez, e nenhuma conta se perde — mas até
revalidarem, nada conta como verificado e as funções pagas fecham.

---

## Conferir o banco sem abrir o painel

```bash
# tabelas que existem
npx wrangler d1 execute contr0l-cloud --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"

# a migração 002 pegou? tem de aparecer blob_key, não r2_key
npx wrangler d1 execute contr0l-cloud --remote \
  --command "SELECT sql FROM sqlite_master WHERE name='backups'"

# quantas contas e quantos backups existem (sem ler dado de ninguém)
npx wrangler d1 execute contr0l-cloud --remote \
  --command "SELECT (SELECT COUNT(*) FROM accounts) contas, (SELECT COUNT(*) FROM backups) backups"

# trilha de auditoria, inclusive exclusões de conta
npx wrangler d1 execute contr0l-cloud --remote \
  --command "SELECT at, action, subject, reason FROM audit ORDER BY id DESC LIMIT 20"
```

`--remote` é obrigatório em todos: sem ele o wrangler fala com uma cópia local de
desenvolvimento e você conclui coisas erradas sobre produção.

---

## Ligar o bloqueio de download (fase 13)

Hoje `PAID_APPS = ""`, ou seja, o download é aberto. Para religar:

```bash
# no wrangler.toml:  PAID_APPS = "contr0l"
npx wrangler deploy
```

A página se adapta sozinha — o campo de chave aparece quando o gateway passa a
exigir uma. **Não religue antes de existir forma de pagar:** foi exatamente isso
que deixou a página sem saída em 2026-08-28, nem entregando o APK nem vendendo.

---

## Se o deploy sair errado

O Worker não tem staging, então o caminho é voltar a versão anterior:

```bash
npx wrangler deployments list          # pegue o id da versão boa
npx wrangler rollback [<version-id>]
```

Rollback **não desfaz migração de banco**. Se o deploy ruim veio junto com um
`d1 execute`, o rollback traz o código antigo de volta para cima do schema novo —
por isso migração de D1 aqui é escrita para ser compatível com a versão anterior
do código, e não como um passo atômico junto do deploy.

---

## O que ainda falta na fase 11/17

O deploy **não** é o pendente. O que falta é o que só um aparelho de verdade
prova (seção "Verificação" da spec da nuvem):

1. Cadastrar no app, gravar movimentações, enviar o backup, desinstalar,
   reinstalar, entrar, restaurar e conferir que os lançamentos batem.
2. Modo avião: o app abre, lê e grava normalmente com conta cadastrada.
3. Apagar a conta pelo app e conferir, na trilha de auditoria, o
   `conta_apagada` correspondente — e que `GET /v1/backup` passou a dar 401/404
   para aquela sessão.
4. E-mail de contato do titular nas páginas legais (art. 41), que hoje remetem ao
   canal de entrega porque o domínio próprio (fase 14) ainda não existe.

Spec: [`docs/superpowers/specs/2026-08-29-nuvem-sync-design.md`](superpowers/specs/2026-08-29-nuvem-sync-design.md).
