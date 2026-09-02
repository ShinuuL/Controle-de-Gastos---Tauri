# Roadmap — Controle de Gastos

> **Incidente 2026-09-01:** a 0.5.3 ficou algumas horas no ar impedindo o app
> de abrir em aparelhos com o histórico de migrações divergente — e sem
> oferecer o botão de reparo, porque o erro que chegava à tela era de segunda
> ordem (`no such table: app_meta`). A 0.5.4 corrigiu. Detalhes em
> [`docs/release-0.5.4.md`](docs/release-0.5.4.md).

**Status geral:** Fase 11/17 (nuvem) com os 6 passos da spec entregues no lado do app e a infraestrutura no ar (conferida em 2026-09-01; ver [`docs/deploy-do-gateway.md`](docs/deploy-do-gateway.md)). **Fase 21 (atualização pelo app): a faixa foi vista em aparelho real em 2026-09-01** — a 0.5.2 instalada enxergou a 0.5.3 publicada na primeira abertura. Falta o trecho que exige o dedo (permissão do Android, download, instalador). A nuvem segue sem validação de ponta a ponta em aparelho. A venda vem depois: **17 (nuvem) → 21 (atualização) → 14 (Stripe) → 20 (trial e premium)**. A venda vem depois: **17 (nuvem) → 21 (atualização) → 14 (Stripe) → 20 (trial e premium)**.

---

## Pendências abertas em 2026-09-01

Uma lista só, para não caçar pendência espalhada por dez seções. Ordem de quem
bloqueia mais.

**No aparelho (bloqueia fechar a fase 11/17 e a 22):**

1. **Ponta a ponta da nuvem:** cadastrar, lançar, enviar backup, desinstalar,
   reinstalar, entrar, restaurar e conferir que os lançamentos batem. Depois:
   modo avião com conta cadastrada, e apagar uma conta de teste conferindo o
   `conta_apagada` na trilha de auditoria do D1.
2. ~~**Importar o CSV do Nubank que falhou**~~ — **RESOLVIDO em aparelho real
   em 2026-09-01, na 0.5.4.** O extrato importou. O CSV também foi conferido
   contra o PDF do mesmo período e bate exato (82 linhas, entradas 4.407,47,
   saídas 4.409,54, saldo 0,45) — o arquivo nunca foi o problema.

   **A causa não é a que a 0.5.2 anunciou.** Aquela versão dizia que a v4 tinha
   sido carimbada como aplicada sem rodar, e trouxe uma cura automática para
   isso. A causa real é outra: o histórico do banco estava **divergente**, o
   sqlx aborta a execução INTEIRA quando um checksum não confere, e por isso
   **nenhuma** migração rodava naquele aparelho.

   O que escondia isso por semanas era o `db.ts`: quando a abertura falhava, ele
   tentava de novo — e o comando `load` do tauri-plugin-sql **consome** a lista
   de migrações na primeira chamada, então a segunda abria o banco sem migrar
   nada e dava certo. O app subia normal, a tela de reparo nunca aparecia, e o
   erro só surgia muito depois, numa consulta a uma coluna que a migração
   pendente teria criado.

   **Lição:** um erro de segunda ordem chegando à tela custou uma release
   inteira apontando para o mecanismo errado. A 0.5.4 repete a primeira falha em
   vez de tentar de novo, e foi isso que fez a causa aparecer.

   **A cura automática da 0.5.2 (carimbo sem efeito) segue sem prova de campo.**
   Ela trata um caso que este aparelho não tinha.
3. **Fundo do tema no celular** e o color picker e o botão voltar da fase 19,
   que nunca foram confirmados em aparelho real.
4. **Um PDF de extrato do Nubank** para conferir o parser genérico com arquivo
   de verdade (fase 19). O arquivo já existe em `extrato/` desde 2026-09-01;
   até agora só serviu para validar o CSV, não para exercitar o parser de PDF.
5. **Atualização pelo app (fase 21):** ~~publicar uma versão maior que a
   instalada~~ ~~conferir a faixa~~ — **a faixa foi confirmada em aparelho real
   em 2026-09-01** (Redmi 24117RN76L, Android 16): com a 0.5.2 instalada e a
   0.5.3 publicada, a faixa "Versão 0.5.3 disponível — São 86 MB" apareceu na
   primeira abertura, com o botão de baixar. Boot limpo, sem panic nem erro de
   SQLite no logcat.

   **Falta o que exige o dedo:** a tela de permissão do Android, o download e o
   instalador abrindo. A MIUI recusa `input tap` e `pm clear` via adb
   (`SecurityException: INJECT_EVENTS` / `CLEAR_APP_USER_DATA`), então o resto
   não se automatiza daqui. Para automatizar, ligar **Depuração USB
   (Configurações de segurança)** nas opções de desenvolvedor.

   **Por que a faixa não aparecia antes:** o aparelho gastou a checagem do dia
   quando a 0.5.2 ainda não existia. A checagem é uma por dia **e** só no cold
   start, e todo desfecho que não seja "há versão nova" era silêncio absoluto —
   `cedo`, `em_dia`, `indisponivel` davam a mesma tela em branco. A 0.5.3 dá um
   botão de verificar na hora, que responde em português.

**Fora do código:**

5. **E-mail de contato do titular** nas páginas legais (art. 41). Hoje elas
   remetem ao canal de entrega, porque o domínio próprio não existe.
6. **Domínio próprio** (fase 14): destrava e-mail transacional, webhooks do
   Stripe e o endereço das páginas legais.
7. **Compra única vs. assinatura**, decidido **antes** de criar o produto no
   Stripe: trocar depois obriga a migrar quem já comprou.
8. **Revisão por advogado** antes de cobrar do primeiro cliente (fase 15b).
9. **`ADMIN_TOKEN` guardado fora de pasta temporária** — quem tem esse token
   emite acesso pago de graça.

**Decididas e não iniciadas:** fase 14 (Stripe), fase 20 (trial e premium),
fase 21 (atualização automática no aparelho).

**Não são pendência, e sim decisão:** `PAID_APPS` vazio (fase 13) e iOS fora de
escopo (fase 18).

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
| 12 | Reparo de migração quebrada | ✅ Concluída | Diagnóstico e reparo por *stamping* + tela de reparo no boot | 7 testes Rust + 5 TS, validado em aparelho real (2026-08-27) |
| 13 | Chave de licença no download | ✅ Concluída | KV de licenças, rotas de administração e campo de chave na página | Verificado de ponta a ponta; `PAID_APPS` desligado de propósito |
| 19 | Importação, navegação e cor | ✅ Concluída | Desbloqueio da importação Nubank, PDF de qualquer banco, duplicatas contra lançamento manual, botão voltar do Android, color picker de categoria | 214 testes TS, lint/typecheck/build limpos, validação em aparelho pendente |
| 11/17 | Nuvem: conta, backup cifrado e entitlement | 🟡 App pronto | Cripto, contas, entitlement assinado, backup cifrado, sessão persistida, push automático e exclusão de conta | 63 testes Rust + 50 no gateway; Worker no ar; **validação em aparelho pendente** |
| 15b | LGPD | 🟡 Parcial | Exclusão de conta pelo app, política de privacidade e termos de uso | 6 testes em `landing/legal.test.js`; falta e-mail de contato e revisão jurídica |
| 21b | Fundo do tema em vetor | ✅ Concluída | Ladrilho SVG no desktop; bitmap original de volta no celular (2026-09-01) | Contagem de frutas conferida contra a arte original |
| 22 | Importação no aparelho e fundo do celular | ✅ Concluída | Conciliação em uma consulta só e causa do erro visível na tela | 267 testes TS + 63 Rust, lint/typecheck/build limpos |
| 21 | Atualização automática no aparelho | 🟡 Código pronto | Manifesto assinado verificado no app, download com sha256 conferido e entrega ao instalador do sistema | 11 testes Rust + 11 TS; compila para `aarch64-linux-android` e o Kotlin compila; **falta rodar em aparelho** |

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

### Fase 11 — Nuvem (= fase 17; desenho de implementação aprovado em 2026-08-29)

Esta entrada e a **fase 17** são a mesma fase: aqui ficou o stub de uma linha,
lá ficou o detalhamento. O desenho de implementação está em
[`docs/superpowers/specs/2026-08-29-nuvem-sync-design.md`](docs/superpowers/specs/2026-08-29-nuvem-sync-design.md)
e fecha o que o doc de arquitetura deixava em aberto: formato do envelope
cifrado, derivação de chaves, esquema do control plane, rotas, comandos Rust e
ordem de implementação.

**Backend decidido em 2026-08-29:** estender o gateway Cloudflare que já existe
(Workers + KV da fase 13), acrescentando R2 para o `.db` cifrado e **D1** para o
control plane — no lugar do serviço TypeScript separado e do Turso que o doc de
arquitetura recomendava. Um Worker só, uma conta a menos.

SQLite continua local e é a fonte de leitura; a sincronização entra por comandos
Rust tipados, nunca como segundo caminho de leitura no React.

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

### Fase 13 — Chave de licença no download (✅ concluída em 2026-08-28)

**A chave protege o download, não o app.** O app permanece exatamente como é
hoje: local-first, sem cadastro, sem rede. Quem baixa pode repassar o APK e ele
funciona — isso é aceito conscientemente. Fazer o app validar licença quebraria
as duas promessas que a landing page faz ("sem cadastro" e "nenhuma requisição
de rede") e mataria o funcionamento offline no primeiro uso, que é a razão de o
produto existir.

Metade disso já existe no gateway (`gateway/src/index.js`): `PAID_APPS` lista os
apps que exigem licença, o KV `LICENSES` guarda cada chave, e o cliente a envia
em `x-license-key` ou `?license=`. As respostas `401 license_required` e
`403 license_invalid | license_expired | license_other_app` já estão implementadas.

Entregue:
- KV `LICENSES` criado e `PAID_APPS = "contr0l"` ligado. O download passou a exigir chave.
- Rotas `/v1/admin/licencas` no gateway: emitir, listar e revogar, protegidas pelo segredo `ADMIN_TOKEN` com comparação de tempo constante.
- Chave em alfabeto sem `I`, `O`, `0` e `1`, porque é ditada e digitada por pessoas.
- Revogar marca `status: "revoked"` em vez de apagar: preserva o registro de que a chave existiu e para quem foi.
- Campo de chave na página, guardado em `localStorage`, e aceitação por `?license=` para você mandar um link pronto no WhatsApp — a chave some da barra de endereços depois de aplicada.
- `portal/admin.html`: painel local para emitir, listar e revogar.

Verificado de ponta a ponta: sem chave `401`, chave inválida `403 license_invalid`,
chave revogada `403 license_revoked`, chave válida libera manifesto e download.

**`PAID_APPS` está vazio desde 2026-08-28**, ou seja, o bloqueio está desligado.
Ficou ligado por pouco tempo e isso deixou a página num estado sem saída: não
entregava o APK e também não vendia, porque o PIX ainda não existe. Religar é
devolver `PAID_APPS = "contr0l"` e rodar `wrangler deploy`; o KV, as chaves já
emitidas e as rotas de administração seguem funcionando enquanto isso.
A página se adapta sozinha: o campo de chave só aparece quando o gateway exige uma.

**Envio de e-mail ficou fora.** O `onboarding@resend.dev` só entrega no e-mail da
própria conta Resend, então a API key existente não serve sem domínio verificado
(`.com.br` custa R$ 40/ano no Registro.br). A API oficial do WhatsApp foi
descartada: exige conta Meta Business com CNPJ, número dedicado e templates
aprovados. Entrega manual por WhatsApp resolve no volume atual.

**Não requer backend, banco ou contas.** Turso, login e sincronização ficam para
a fase 17.

### Sequenciamento decidido em 2026-08-29

A venda deixa de ser o próximo passo. A ordem passa a ser **17 (nuvem) → 14
(Stripe) → 20 (trial e premium)**, porque trial e função paga precisam de
identidade e de um entitlement que o usuário não consiga zerar reinstalando o
app. O domínio próprio e a conta Stripe podem ser comprados e configurados em
paralelo, já que não dependem de código do app. As pendências
abaixo continuam válidas, mas os itens 3 e 4 (religar o bloqueio de download)
esperam essa decisão.

### Pendências imediatas (histórico da sessão de 2026-08-29)

> Mantido como registro. **A lista viva é "Pendências abertas" no topo deste**
> **arquivo** — o item 5 já estava feito, e os itens 3 e 4 continuam esperando a
> decisão de sequenciamento (venda depois da nuvem).

Ordem sugerida. Os dois primeiros itens já foram entregues; o que resta é a venda.

**1. ~~Arte do totalizador de entradas~~** — concluída em 2026-08-28. O JPEG
entregue tinha fundo preto gravado; o recorte preservou os contornos do desenho
e a arte foi reduzida a 600px (293 KB).

**2. ~~Publicar a 0.4.1~~** — publicada em 2026-08-29 (a 0.4.0 saiu em
2026-08-28): https://github.com/ShinuuL/Releases/releases/tag/contr0l-v0.4.1

Verificado no gateway: manifesto assinado válido para a chave pública do
`deploy.toml`, e o binário baixado pelo gateway é byte a byte idêntico ao
compilado localmente.

| | |
|---|---|
| versionName / Code | 0.4.1 / 4001 |
| sha256 | `6cf9ddfc219cd29e4cc49d8933657425d1553b0dfa81a2202703800dff71670d` |
| Tamanho | 72.809.313 bytes |

O ganho de ~1,8 MB sobre a 0.3.0 é o pdf.js, que entra em chunk próprio e só é
carregado quando o usuário importa um PDF.

Na 0.4.0: importação de extrato em PDF, correção do parser de CSV para o
formato que o app do Itaú realmente exporta, ações em massa na revisão da
importação, e o totalizador de entradas passando a contar só o que já foi
efetivado (com previstas virando realizadas na data).

Na 0.4.1: importação de extrato do Nubank. O CSV passou a ter um parser por
banco (`itauCsv.ts`, `nubankCsv.ts`) sobre um leitor comum, com o banco
detectado pelo delimitador do cabeçalho antes de qualquer valor ser lido --
"1.234" vale R$ 1.234,00 no Itaú e R$ 1,23 no Nubank, e adivinhar por valor
erraria por fator de 1000 em silêncio.



**3. QR PIX e formulário na página** — é o que falta para religar o bloqueio com
sentido. Hoje `PAID_APPS` está vazio de propósito (ver fase 13).

**4. Religar o bloqueio:** `PAID_APPS = "contr0l"` no `wrangler.toml` do gateway
e `wrangler deploy`. A página passa a exibir o campo de chave sozinha.

**5. ~~Versionar o deploy-base~~** — verificado em 2026-08-29: já estava feito.
`gateway/src/index.js` e `gateway/wrangler.toml` estão versionados e no
`origin` (`ShinuuL/deploy-base`), com a árvore limpa. A lógica de emissão e
revogação de licenças não está mais só no disco.

**6. Guardar o `ADMIN_TOKEN`** fora de pasta temporária, se ainda não foi feito.
Quem tem esse token emite acesso pago de graça.

---

### Fase 14 — Pagamento (Stripe, decidido em 2026-08-29)

**Stripe substitui o PIX manual.** A decisão anterior era QR PIX com confirmação
à mão; com Stripe o pagamento é confirmado por webhook, e a emissão de acesso
deixa de depender de alguém olhando o extrato. Isso derruba o principal motivo
de a fase 14b existir como trabalho obrigatório -- o painel continua útil para
suporte e revogação, mas não é mais o fluxo normal.

**Domínio próprio será comprado** (decidido em 2026-08-29). Ele destrava três
coisas que hoje estão paradas: e-mail transacional com domínio verificado (a
fase 13 registrou que `onboarding@resend.dev` só entrega na própria conta
Resend), a página fora de um subdomínio de terceiro, e os webhooks do Stripe
apontando para um endereço estável.

Itens:
- Conta Stripe e produto criado; checkout na página.
- Webhook de pagamento confirmado → emitir acesso e enviar por e-mail.
- Estorno/chargeback via webhook → revogar acesso automaticamente.
- Decidir compra única vs. assinatura **antes** de criar o produto: a fase 20
  (trial de 30 dias) empurra para assinatura, e trocar depois obriga a migrar
  quem já comprou.
- Stripe exige dados fiscais do vendedor e trata cartão — a revisão da fase 15b
  deixa de ser opcional.

### Fase 14b — Painel administrativo (rebaixado para suporte em 2026-08-29)

Era obrigatório porque, com PIX confirmado à mão, emitir chave e enviar e-mail
era o fluxo normal. Com Stripe confirmando por webhook, o fluxo normal não passa
por humano: o painel volta a ser ferramenta de suporte -- consultar, reenviar,
revogar -- e não a única forma de entregar o que foi comprado.

Itens:
- Lista de pagamentos recebidos e chaves emitidas, com o e-mail de destino.
- Emitir chave, reenviar e-mail, revogar chave.
- Registro de quem emitiu, quando e para qual pagamento.
- Autenticação separada e segundo fator: quem entra aqui distribui acesso pago de graça.
- Mora no site, não neste repositório.

### Fase 15 — ~~Dois APKs~~ (cancelada em 2026-08-28)

Existia porque o app seria bloqueado por login, exigindo um build gratuito e um
pago. Com a licença protegendo apenas o download, **há um único APK** — o mesmo
para quem compra e para quem recebe de você.

Isso torna obsoletos o `VITE_DISTRIBUTION` (`gated`/`direct`) em
`src/lib/cloud/distribution.ts` e a regra `decideAccess()` em
`src/features/auth/session.ts`, que decidia liberar telas conforme o canal. Os
placeholders de autenticação continuam válidos, mas passam a pertencer à fase
17: sincronizar dados na nuvem exige identidade, comprar não exige.

### Fase 15b — LGPD (bloqueia a cobrança do primeiro cliente)

> **Parcialmente entregue em 2026-09-01** — política, termos e exclusão de
> conta estão em "Fase 15b/11", mais abaixo. O que resta desta lista é a rota
> no Worker, o e-mail de contato e a revisão jurídica.

**Escopo reduzido pela decisão de 2026-08-28.** Com a licença protegendo só o
download, nenhum dado financeiro sai do aparelho e nada disso chega a um
servidor seu. O que você passa a tratar é apenas **e-mail e chave de licença** —
dado pessoal, mas de baixo risco, e o suficiente para as obrigações caírem de
patamar. A discussão de criptografia ponta a ponta migra para a fase 17, junto
com a sincronização que a torna necessária.

Itens:
- Base legal: execução de contrato (art. 7º), não consentimento.
- Minimização: guardar só e-mail, chave e referência do pagamento.
- Eliminação: apagar e-mail e chave quando solicitado, mantendo o registro fiscal do pagamento, que tem base legal própria.
- Transferência internacional (art. 33): o KV da Cloudflare e o provedor de e-mail ficam fora do Brasil.
- Política de privacidade e termos antes do primeiro cadastro real.
- Canal de contato do titular (art. 41; Resolução CD/ANPD nº 2/2022 simplifica DPO para pequeno porte).
- Revisão por advogado antes de cobrar do primeiro cliente.

### Fase 15b/11 — LGPD: exclusão de conta, política e termos (lado do app ✅ 2026-09-01)

Passo 6 da spec da nuvem, que é o que libera as fases seguintes.

**Apagar a conta virou função do app, não pedido por e-mail.** A LGPD dá o
direito (art. 18) e a única forma honesta de oferecê-lo, num produto que promete
não ter acesso aos dados, é o próprio usuário disparar. `cloud_apagar_conta`
manda `DELETE /v1/me` com a palavra `APAGAR` no corpo e **só depois de o
servidor confirmar** limpa o que era local: sessão em disco, entitlement em
cache e versão do backup.

Três decisões que valem registro:

- **Os lançamentos não são apagados.** Eles nunca foram do servidor. Apagar a
  conta devolve o app ao que ele era antes de existir conta — e apagar os dados
  do aparelho junto seria destruir o que o usuário não pediu para destruir.
- **A ordem é servidor primeiro.** Limpar o local antes deixaria o usuário sem
  sessão e com a conta viva, sem caminho de volta para tentar de novo. `404`
  conta como sucesso: a conta já não existe, que era o pedido.
- **A confirmação viaja para o servidor.** Digitar `APAGAR` não é só atrito de
  interface; o gateway exige a mesma palavra, para que um `DELETE` disparado por
  engano não apague uma conta só por portar token válido.

**Política e termos existem e estão linkados** (`landing/privacidade.html`,
`landing/termos.html`, estilo em `landing/legal.css`). A política declara base
legal (execução de contrato, art. 7º V — não consentimento), a tabela do que
existe do meu lado e o que dela eu consigo ler, transferência internacional pela
Cloudflare (art. 33), prazos de retenção e o caminho da exclusão. Os termos põem
a perda de senha em destaque, e não em cláusula: sem a senha, o backup não volta
— nem por mim.

`landing/legal.test.js` (6 testes) trava o que quebra em silêncio: página legal
que existe mas não está linkada, link para arquivo que não existe, e o aviso de
senha perdida desaparecendo numa revisão de texto.

**A rota do servidor já existia.** Conferido em 2026-09-01 contra o Worker no
ar: `DELETE /v1/me` responde 401 sem token e 400 sem `{"confirmacao":"APAGAR"}`,
apaga o blob do KV junto com a conta e as sessões, e grava `conta_apagada` na
trilha de auditoria **sem o e-mail** — o registro da eliminação não pode ser ele
próprio uma cópia do dado eliminado. A palavra de confirmação bateu nos dois
lados sem ajuste.

**Falta, e depende de você:**
- Apagar uma conta de teste pelo app e conferir o `conta_apagada` na auditoria.
- E-mail de contato do titular nas duas páginas (art. 41). Hoje elas remetem ao
  canal por onde o app é entregue, porque o domínio próprio da fase 14 ainda não
  existe.
- Revisão por advogado antes de cobrar do primeiro cliente — segue valendo.

### Fase 16 — Landing page e release

**Detecção de plataforma entregue em 2026-08-30.** A landing escolhe o download
pelo user agent: Android recebe o APK, Windows recebe o instalador (com o APK ao
lado, para quem quer mandar para o próprio celular) e iPhone recebe a explicação
de que não há versão. Enquanto o `.exe` não existir, quem está no Windows vê um
aviso em vez de um botão que não baixa nada. A regra está travada em
`landing/plataforma.test.js` (13 testes).

**A próxima publicação precisa incluir o `.exe`.** `npm run windows:release`
compila e prepara o instalador, e a entrada correspondente já está no
`deploy.toml` — o `publish` **recusa** enquanto o arquivo não existir, de
propósito: publicar sem ele deixaria a página oferecendo um botão vazio.

**Build do Windows validado em 2026-08-30.** `npm run windows:release` roda de
ponta a ponta sem pendência de ferramenta: o Tauri baixa o WiX sozinho e gera
MSI **e** NSIS. O instalador tem **9,0 MB** contra 72,8 MB do APK — o APK carrega
as bibliotecas nativas de todas as ABIs, o `.exe` usa o WebView2 do sistema.

| | |
|---|---|
| Arquivo | `dist-windows/contr0l.exe` (NSIS) |
| Tamanho | 9.020.721 bytes |
| Também gerado | `Contr0l_0.4.1_x64_en-US.msi` (não publicado) |

O instalador **não é assinado** com certificado de editor, então o SmartScreen
avisa na primeira execução — a landing page já explica isso nos passos de
instalação do Windows.


Itens:
- Página de apresentação com download e checkout.
- `portal/index.html` do deploy-base tem `GATEWAY` fixo no código e rotula todo artefato como "instalador" — precisa tratar `kind = "apk"`.
- Publicação via `deploy.toml` (já criado na raiz; `repo`, `gateway` e chaves ainda com placeholder).

### Fase 17 — Sincronização em nuvem

Herda da fase 15b a discussão de **criptografia ponta a ponta**: é a
sincronização que faz dados financeiros saírem do aparelho, e é aqui que a
decisão passa a valer. Também é aqui que contas e identidade voltam a ser
necessárias — os placeholders em `src/features/auth/` pertencem a esta fase,
não à compra.

**Desenho de implementação aprovado em 2026-08-29:**
[`docs/superpowers/specs/2026-08-29-nuvem-sync-design.md`](docs/superpowers/specs/2026-08-29-nuvem-sync-design.md).
Ele substitui o Turso por **D1** e o backend separado pelo **gateway Cloudflare
existente**; o resto desta seção continua valendo.

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

## Onde este projeto se encaixa

O Contr0l não é uma ilha: ele publica pelo **deploy-base** e aparece no
**portal-geral**, e os dois têm nota no vault (`D:\Dev\Desenvolvimento\`).

| Peça | Caminho |
|---|---|
| App (este repo) | `D:\Dev\Desenvolvimento\Projetos\Controle de gastos` |
| Publicação e gateway | `D:\Dev\Desenvolvimento\Projetos\deploy-base` · nota `Projetos\deploy-base.md` |
| Portal que agrega os apps | `D:\Dev\Desenvolvimento\Projetos\portal-geral` · nota `Projetos\Portal Geral.md` |
| Binários publicados | repo privado `ShinuuL/Releases`, tag `contr0l-v<versão>` |
| Worker em produção | `https://updates-gateway.sofaltaumaletr.workers.dev` |

**O vault não tinha nota do Contr0l** — tinha [[Volume Mixer]] e [[deploy-base]],
e faltava justamente o maior dos três. Criada em 2026-09-01:

- `Projetos\Contr0l.md` — a nota, no estilo das que já existem. A cópia de
  origem fica em [`docs/vault/Contr0l.md`](docs/vault/Contr0l.md); ao mudar algo
  relevante do projeto, atualizar as duas.
- `Projetos Índice.md` — entrada nova no topo da lista.
- `Portal Geral.md` — o `contr0l` que era texto virou [[Contr0l]].
- `deploy-base.md` — a nota falava só do download; ganhou as licenças e as rotas
  da nuvem, que moram no mesmo Worker.

---
## Notas de arquitetura

- **Não há tabela `transactions` no banco.** O tipo `Transaction` lê da tabela `expenses`, que tem colunas `nature` (`'entrada'`/`'saida'`) e `status` (`'previsto'`/`'realizado'`). Essa é a arquitetura atual e não deve ser alterada sem nova migração.
- **`ExpensesScreen`** é legado: filtra `nature = 'saida' AND status = 'realizado'`. A tela de Movimentações (`TransactionsScreen`) cobre o mesmo escopo com mais funcionalidade.
- **Banco dev antigo:** ao recriar o schema (ex.: durante migrações), o arquivo `.db` antigo deve ser apagado para que o plugin recrie com o schema atualizado incluindo `nature`/`status`.
- **Testes de componente/UI** (opcional, não planejado): hoje a UI é verificada via typecheck + build + passada visual (vision). Não há infra de jsdom/testing-library. Considerar se a complexidade da UI justificar.

### Fase 19 — Importação, navegação e cor (✅ concluída em 2026-08-29)

Correções levantadas na validação em aparelho e no emulador.

**Importação do Nubank não estava quebrada no parser.** O CSV real lê 70 de 70
linhas sem erro; o que travava era a prévia exigir categoria em todas elas, e
nenhum extrato de banco traz coluna de categoria. A prévia passou a pré-preencher
com "Outros" e a mensagem de bloqueio saiu do cinza claro para o vermelho.

- A coluna `Identificador` do Nubank virou o fingerprint da importação:
  reimportar o mesmo período reconhece as linhas, e o fingerprint sobrevive a
  edição de natureza na prévia (a chave anterior derivava da natureza).
- **PDF deixou de ser só do Itaú.** `genericPdf.ts` cobre os dois desenhos que
  aparecem na prática -- tabular (Itaú, BB, Bradesco, Caixa) e por bloco de dia
  (Nubank, Inter, C6) -- com o banco detectado em `statementPdf.ts` e o parser
  posicional do Itaú mantido como caminho preferencial. Validado contra o PDF
  real do Itaú: o parser genérico reproduz as mesmas 55 linhas, com soma
  idêntica ao saldo impresso no extrato (R$ 8,74).
- Dois defeitos só apareceram nessa validação: a detecção do Itaú olhava só a
  primeira página (a marca está no rodapé das seguintes) e valores sem sinal
  eram assumidos como saída. Agora o parser lê do próprio documento se ele marca
  débito com `-` e infere o resto disso.

**Duplicatas contra lançamento digitado à mão.** A regra anterior exigia 75% de
semelhança de texto, o que inutilizava a checagem justamente no caso que
importa: quem digita escreve "Uber", o extrato traz "Transferência enviada pelo
Pix - 99 TECNOLOGIA LTDA". Agora mesmo valor e natureza dentro de **±3 dias**
sempre vai para decisão manual, com a movimentação existente exibida ao lado. A
janela existe porque quem digita usa a data da compra e o banco registra a da
liquidação.

**Botão voltar do Android.** Não havia tratamento nenhum: voltar fechava o app
com o formulário preenchido dentro. `src/lib/navigation/backGuard.ts` ancora
cada camada dispensável (aba fora do resumo, modal, confirmação) numa entrada do
histórico. No resumo sem nada aberto continua sem entrada, e aí voltar encerra o
app -- que é o esperado no Android. Sem alteração no Rust.

Duas armadilhas resolvidas, ambas encontradas por teste:
- `popstate` notifica **todos** os listeners registrados, então um listener por
  camada faria um único toque fechar o modal e a aba de uma vez. Daí a pilha
  própria, em que só o topo responde.
- `history.back()` é assíncrono. Com o StrictMode montando, desmontando e
  remontando cada efeito em desenvolvimento, o evento do `back()` da limpeza
  chegava depois do remonte e era lido como voltar do usuário: o modal de
  importação abria e fechava sozinho. Daí a contagem `pendingSelfPops`, e o
  listener só sair quando não há camada **nem** evento próprio a consumir.

**Cor de categoria.** Paleta fixa de oito cores virou seletor livre
(`ColorPicker.tsx`), disponível na criação **e** na edição -- antes não havia
como trocar a cor depois de criada. No tema moranguinho a cor passa por
`strawberryBerryColors`: a matiz escolhida é preservada, a luminosidade entra na
faixa 38–70% (branco não some na superfície clara, preto não some dentro do
contorno) e o contorno do morango é derivado da cor, no lugar do marrom fixo que
ora sumia no preenchimento ora o engolia.

Efeito colateral necessário: no formulário de edição, orçamento vazio passou a
significar "sem orçamento". Antes a validação travava quem só queria trocar a
cor de uma categoria que nunca teve limite.

O botão "Importar extrato" era `ghost` (só texto apagado) e virou sólido
secundário -- variante nova em `Button.tsx`.

**Pendente:** validação em aparelho real do voltar e do color picker, e um PDF
de extrato do Nubank para conferir o parser genérico com arquivo de verdade.

**Atualização de 2026-09-01:** a importação do Nubank voltou a falhar em uso
real, e não era o parser de novo — era a consulta de conciliação. Ver fase 22.

### Fase 22 — Importação no aparelho e fundo do celular (✅ 2026-09-01)

Duas correções vindas de uso real no Android.

**A importação do Nubank falhava na conciliação, não no parser.** O CSV real lê
70 de 70 linhas sem uma única ressalva — conferido de novo hoje, contra o arquivo
de verdade, incluindo a gravação no SQLite com as cinco migrações aplicadas. O
que quebrava era `findReconciliationCandidates`, que fazia **uma consulta por
linha do extrato**: 70 idas e voltas de IPC, e bastava uma falhar para a prévia
inteira morrer.

Agora é **uma consulta só** para o extrato inteiro — janela da data mais antiga
menos 3 dias até a mais recente mais 3 — com o casamento por valor e natureza
feito sobre o resultado. Mesma semântica, 1/70 do tráfego.

**O `catch {}` que engolia a causa foi o defeito de verdade.** A mensagem
genérica era tudo que sobrava de qualquer falha, num aparelho onde não há console
para conferir. A prévia passou a mostrar a causa junto: *"Não foi possível
comparar o extrato com as movimentações: `<causa>`"*. Se voltar a falhar, a tela
diz o que o SQLite reclamou em vez de deixar adivinhar.

> **Honestidade sobre o diagnóstico:** contra um SQLite real, a consulta antiga
> executa sem erro — inclusive com o mesmo binding que o `tauri-plugin-sql` faz,
> em que número vira `f64`. A causa raiz **não foi provada**; o que se fez foi
> eliminar a hipótese de volume e tornar as outras visíveis na próxima tentativa.

**Fundo do moranguinho no celular voltou ao bitmap.** A fase 21b trocou os dois
bitmaps por um ladrilho SVG e usou o mesmo caminho para celular e desktop. No
aparelho a estampa ficou com a escala do ladrilho, e numa tela estreita isso muda
o desenho que o app tinha. Agora a regra é por tamanho de tela: até 767px o
`Fundo-Mobile.jpeg` original (`100% auto`, `repeat-y`, que só reduz e nunca
amplia), acima disso o vetor — que continua resolvendo a pixelização em janela
grande, que foi o motivo de ele existir.

Pendente: confirmar as duas coisas no aparelho, com o mesmo CSV que falhou.

### Fase 21b — Fundo do tema moranguinho em vetor (✅ 2026-08-30, revisto em 2026-09-01)

O fundo do desktop era um AVIF de **740x493** esticado com `background-size:
cover`. Numa janela 1080p isso amplia cerca de 2,6x em cada eixo — daí a
pixelização, que só apareceu quando o app passou a rodar no Windows. No celular
o problema não existia: lá o CSS usava outro arquivo, com regra que só reduz.

A arte já era **um padrão que se repete**, e padrão não precisa de bitmap. Os
dois arquivos (74,4 KB somados) viraram um ladrilho SVG de **4,7 KB**, nítido em
qualquer tamanho de janela e qualquer densidade de tela, com um único caminho no
CSS para celular e desktop.

Paleta e escala foram **medidas** no JPEG original, não estimadas a olho: morango
de 31x34 px, um a cada ~6.400 px² de fundo. O resultado foi conferido contando
as frutas da imagem renderizada — 63 num recorte de 675x600, a mesma contagem da
arte original.

As posições são sorteadas com distância mínima num espaço **toroidal** (a
distância considera a volta pelas bordas), o que faz o ladrilho encaixar consigo
mesmo sem colar duas frutas na emenda. Fileiras fixas foram tentadas antes e o
olho enxergava as colunas: a estampa virava papel quadriculado. O gerador está
em `scripts/gerar-fundo-morangos.py`, com semente fixa para a saída ser idêntica
a cada rodada.

Duas armadilhas encontradas no caminho:
- **Comentário XML não aceita dois hifens seguidos**, e o estilo de comentário
  deste projeto usa travessão duplo o tempo todo. O SVG não carregava inteiro.
- Estimar tamanho a olho errou duas vezes seguidas, em direções opostas (metade
  e depois o dobro). Medir resolveu na terceira.

### Fase 20 — Trial de 30 dias e funções premium (decidida em 2026-08-29, não iniciada)

**Decisões do desenvolvedor:**

| | |
|---|---|
| Grátis | CRUD manual de movimentações e categorias, dashboard |
| Premium | Importação de extrato (CSV e PDF) e orçamentos por categoria |
| Trial | 30 dias, contados da primeira abertura |
| Pré-requisito | A nuvem (fase 17) entra **antes** da venda |
| Cobrança | Stripe, com domínio próprio (fase 14) |

**Isto revê parte da fase 13.** Lá ficou decidido que "a chave protege o
download, não o app", justamente para preservar as duas promessas da landing
page: sem cadastro e sem requisição de rede. Trial e funções pagas exigem o
oposto -- o app precisa saber quem é o usuário e até quando o acesso vale. As
duas promessas da página precisam ser reescritas antes de a fase 20 entrar no
ar, e o texto atual não pode sobreviver a ela.

**Por que a nuvem vem antes.** Um trial guardado só no aparelho é contornado
reinstalando o app ou limpando os dados; e a mesma identidade que valida o
entitlement é a que a sincronização já exige. Fazer os dois de uma vez evita
construir um controle local descartável. É a razão de a ordem ser 17 → 14 → 20,
e não a numérica.

**Dois princípios fixados pelo desenvolvedor em 2026-08-29**, que valem como
critério de recusa e não como intenção vaga:

1. **Os dados continuam seguros.** O que sobe é o `.db` cifrado no aparelho,
   arquivo opaco para o servidor (fase 17). Entitlement, conta e pagamento são o
   control plane e não tocam lançamento nenhum.
2. **O app continua simples.** Trial e portão de acesso não podem virar uma
   segunda camada de telas. Se uma função paga exigir fluxo próprio de conta
   dentro do app, ela é redesenhada, não adicionada.

Itens (nenhum iniciado):
- Entitlement na nuvem, com carência offline: o app precisa continuar utilizável
  sem rede por um período, ou quebra a promessa local-first que o produto vende.
- Sincronização por comandos Rust tipados como autoridade do banco, conforme
  AGENTS.md e a fase 17 -- não como segundo caminho de leitura no React.
- Portões de UI nas telas pagas, com tela de upgrade no lugar da função.
- Contagem do trial vinculada à conta, não ao aparelho.
- `VITE_DISTRIBUTION` e `decideAccess()` (declarados obsoletos na fase 15)
  voltam a ter uso -- reavaliar em vez de remover.

### Fase 21 — Atualização automática no aparelho (código entregue em 2026-09-01)

> **Colisão de numeração resolvida em 2026-09-01:** o fundo em vetor também
> tinha sido numerado 21. Como esta entrada foi registrada primeiro, ela ficou
> com o número e a outra virou **21b**.

**Entregue em 2026-09-01, menos a validação em aparelho.** A avaliação abaixo
continua valendo palavra por palavra — inclusive a parte incômoda: *instalar
sozinho não existe no Android*. O que o app faz é verificar, baixar e **abrir o
instalador do sistema**; quem confirma é o usuário, num diálogo do Android.

O que foi feito:

- **`src-tauri/src/update.rs`** — consulta `/v1/apps/contr0l/latest`, confere a
  assinatura Ed25519 do manifesto contra a chave pública do `deploy.toml`, baixa
  o APK e só devolve o caminho se o **sha256 do manifesto assinado** bater. O
  arquivo é escrito como `.parcial` e só ganha o nome final depois da
  conferência: um download interrompido nunca se parece com um arquivo pronto.
- **`src-tauri/gen/android/.../InstaladorPlugin.kt`** — plugin Tauri em Kotlin
  que transforma o caminho em `content://` pelo FileProvider e dispara a Intent.
  Desde o Android 7 passar `file://` para outro app lança
  `FileUriExposedException`, e o instalador roda em outro processo.
- **`src-tauri/src/instalador.rs`** — a ponte, com `permissão`/`pedir permissão`/
  `abrir`. No Windows abre o NSIS baixado; em outras plataformas recusa.
- **`REQUEST_INSTALL_PACKAGES`** no `AndroidManifest.xml`, com o comentário
  dizendo o que ela **não** dá: nada é instalado sozinho.
- **`UpdateBanner`** — faixa, não modal. Quem abriu o app veio lançar um gasto.

Três decisões que valem registro:

- **A canonicalização do manifesto é escrita à mão**, e não sai do
  `serde_json::to_string`. A assinatura cobre o JSON com chaves ordenadas, sem
  espaço e com acento cru (`ensure_ascii=False` do publicador em Python); a
  ordenação do serde depende do feature `preserve_order`, que qualquer
  dependência futura pode ligar sem avisar — e o sintoma seria *toda* release
  virar "assinatura inválida". O teste usa o **envelope real do gateway**, com a
  assinatura de verdade: é o que separa "acho que bate" de "bate".
- **A permissão é explicada antes de gastar dado.** Se o aparelho ainda não
  autorizou instalar apps desconhecidos, o fluxo para e explica — em vez de
  baixar 84 MB para esbarrar na permissão no fim.
- **O tamanho vai no rótulo do botão** ("Baixar e instalar (84 MB)"), não num
  rodapé. Número que ninguém lê não avisa ninguém.

Verificado aqui: 11 testes Rust (incluindo manifesto real, um byte trocado na
URL derrubando a assinatura, e a regra de semver igual à do publicador), 11
testes TS das regras de tela, `cargo check --target aarch64-linux-android` e
`gradlew :app:compileArm64DebugKotlin` passando.

**Falta:** rodar em aparelho — a checagem só tem efeito quando existir versão
maior que a instalada, então o teste real é publicar uma 0.5.1 e ver a faixa
aparecer, a permissão ser pedida e o instalador abrir. E o `versionCode` precisa
subir a cada release, com **o mesmo certificado** de assinatura: o Android
recusa a instalação por cima se o certificado mudar.

**Resposta curta: dá, mas "instalar sozinho" não existe no Android.** O app pode
verificar, baixar e abrir o instalador; quem confirma a instalação é sempre o
usuário, num diálogo do sistema. Instalação silenciosa só é possível para app
com privilégio de sistema ou device owner (MDM corporativo), que não é o caso.

**O plugin oficial não serve.** O `@tauri-apps/plugin-updater` declara suas
dependências sob `cfg(not(any(target_os = "android", target_os = "ios")))` --
ou seja, exclui Android por construção. Ele é o caminho pronto no desktop e não
existe no alvo que a gente publica.

**A parte difícil já está pronta.** O gateway já serve manifesto assinado com
Ed25519 e o sha256 do APK (fases 13 e 16), e a landing já consome esse mesmo
endpoint (`/v1/apps/contr0l/latest`). Falta o lado do app, não o canal.

Itens:
- Consultar o manifesto assinado na abertura, com espaçamento (uma vez por dia,
  não a cada abertura) e falha silenciosa: sem rede, o app não pode travar nem
  mostrar erro -- ele funciona offline por definição.
- Verificar a assinatura Ed25519 **e** o sha256 antes de tocar no arquivo. Sem
  isso, atualização automática vira o melhor vetor de ataque do produto: um
  APK trocado no meio do caminho se instala sozinho.
- Baixar e disparar o `PackageInstaller` via intent. Exige a permissão
  `REQUEST_INSTALL_PACKAGES` no manifesto Android e que o usuário tenha liberado
  "instalar apps desconhecidos" para o Contr0l -- é uma tela de sistema, e o
  primeiro uso vai precisar de explicação na interface.
- O `versionCode` precisa subir a cada release e o APK precisa estar assinado
  com **o mesmo certificado**; o Android recusa a instalação por cima se o
  certificado mudar. Já é o caso hoje, mas passa a ser requisito de correção e
  não de higiene.
- Aviso ao usuário antes de baixar: são ~70 MB por atualização, e baixar isso no
  dado móvel de alguém sem perguntar é abuso.

**Conflito resolvido em 2026-08-29, antes de escrever código.** Verificar
atualização é requisição de rede recorrente, e a landing prometia "nenhuma
requisição de rede" com um contador em zero -- promessa que também cairia com o
trial da fase 20.

**Decisão do desenvolvedor: a página passa a fazer uma promessa só --
ninguém tem acesso aos dados financeiros -- e essa não muda.** "Sem cadastro",
"gratuito" e "zero requisições de rede" saíram do texto: eram verdade no
recorte de hoje e viravam propaganda falsa na fase seguinte. Os contadores
foram trocados pelos que sobrevivem a nuvem, trial e atualização automática
(pessoas com acesso, lançamentos enviados em claro, bytes legíveis por mim).

A regra que fica para qualquer texto novo: distinguir *dado financeiro* -- que
não sai do aparelho em claro, nunca -- de *metadado de funcionamento* (versão,
entitlement), que passa a trafegar. Prometer pouco e cumprir.

**Alternativa considerada e descartada por ora:** publicar na Play Store, que
resolveria atualização automática de graça. Esbarra na diretriz de cobrança da
loja, no mesmo conflito que a fase 18 já registrou para a App Store, e no fato
de a distribuição por APK ser hoje o modelo escolhido.

### Fase 18 — iOS (fora de escopo, decidido em 2026-08-28)

O Tauri 2 suporta iOS, mas nada disso pode ser feito na máquina atual: o
subcomando `tauri ios` **não existe** no CLI em Windows — ele só é compilado em
macOS. Verificado em 2026-08-28.

Pré-requisitos que não dependem de código:

| Requisito | Detalhe |
|---|---|
| Mac com Xcode | Compilar para iOS exige macOS. Não há alternativa suportada. |
| Apple Developer Program | US$ 99/ano, renovação anual. |
| Revisão da App Store | Cada versão passa por análise humana. |

**O modelo de distribuição não se transfere.** iOS não permite instalar um
arquivo baixado de um site, como o APK. As saídas reais são App Store,
TestFlight (limitado a 90 dias por build) ou ad-hoc (100 aparelhos/ano, UDIDs
registrados). A landing page não consegue servir iOS como serve Android.

**Conflito com o modelo de cobrança.** A diretriz 3.1.1 da App Store exige que
desbloqueio de conteúdo digital use compra dentro do app, com comissão da Apple.
Uma chave de licença comprada por fora e digitada no app é justamente o que a
regra proíbe. Ou seja: adotar chave de licença no Android e publicar na App
Store exige dois modelos de cobrança diferentes para o mesmo produto.

**Fora de escopo.** Custa um Mac e US$ 99/ano antes da primeira linha de
código, e a diretriz 3.1.1 obrigaria um segundo modelo de cobrança para o mesmo
produto. Reavaliar apenas se o Android estiver vendendo e houver demanda real.
