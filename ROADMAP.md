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

### Pendências imediatas (para retomar em nova sessão)

Ordem sugerida. Os dois primeiros itens já foram entregues; o que resta é a venda.

**1. ~~Arte do totalizador de entradas~~** — concluída em 2026-08-28. O JPEG
entregue tinha fundo preto gravado; o recorte preservou os contornos do desenho
e a arte foi reduzida a 600px (293 KB).

**2. ~~Publicar a 0.3.0~~** — publicada em 2026-08-28:
https://github.com/ShinuuL/Releases/releases/tag/contr0l-v0.3.0

Verificado no gateway: manifesto assinado válido, e o binário baixado pelo
gateway é byte a byte idêntico ao compilado localmente.

| | |
|---|---|
| versionName / Code | 0.3.0 / 3000 |
| sha256 | `55550123a24df68a8e764901d99c4788c92bd7fad9b92a9833fcd85ce82949be` |
| Tamanho | 70.977.009 bytes |



**3. QR PIX e formulário na página** — é o que falta para religar o bloqueio com
sentido. Hoje `PAID_APPS` está vazio de propósito (ver fase 13).

**4. Religar o bloqueio:** `PAID_APPS = "contr0l"` no `wrangler.toml` do gateway
e `wrangler deploy`. A página passa a exibir o campo de chave sozinha.

**5. Versionar o deploy-base.** O `.gitignore` já está escrito lá. Hoje o
gateway tem lógica de emissão e revogação que existe apenas no disco desta
máquina.

**6. Guardar o `ADMIN_TOKEN`** fora de pasta temporária, se ainda não foi feito.
Quem tem esse token emite acesso pago de graça.

---

### Fase 14 — Pagamento (PIX)

**Compra única, sem assinatura.** O acesso não vence; a única forma de perder é
estorno (MED no PIX).

Itens:
- QR PIX na página, com o e-mail do comprador coletado junto.
- Confirmação manual enquanto não houver PSP com webhook.
- Ao confirmar: gerar a chave, gravar no KV e enviar por e-mail.
- Estorno: marcar a chave como `revoked` no KV — o gateway já recusa.

### Fase 14b — Painel administrativo (obrigatório)

Deixa de ser condicional: com PIX confirmado à mão, gerar chave e enviar e-mail
**é o fluxo normal**, não a exceção.

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

### Fase 16 — Landing page e release

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
