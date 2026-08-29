# Roadmap — Controle de Gastos

**Status geral:** Fase 19 (Correções de importação, navegação e cor) concluída (2026-08-29). A venda está sequenciada depois da nuvem — ver "Sequenciamento decidido em 2026-08-29".

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
| 19 | Importação, navegação e cor | ✅ Concluída | Desbloqueio da importação Nubank, PDF de qualquer banco, duplicatas contra lançamento manual, botão voltar do Android, color picker de categoria | 214 testes TS, lint/typecheck/build limpos, validação em aparelho pendente |

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

### Sequenciamento decidido em 2026-08-29

A venda deixa de ser o próximo passo. A ordem passa a ser **17 (nuvem) → 14
(Stripe) → 20 (trial e premium)**, porque trial e função paga precisam de
identidade e de um entitlement que o usuário não consiga zerar reinstalando o
app. O domínio próprio e a conta Stripe podem ser comprados e configurados em
paralelo, já que não dependem de código do app. As pendências
abaixo continuam válidas, mas os itens 3 e 4 (religar o bloqueio de download)
esperam essa decisão.

### Pendências imediatas (para retomar em nova sessão)

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

**5. Versionar o deploy-base.** O `.gitignore` já está escrito lá. Hoje o
gateway tem lógica de emissão e revogação que existe apenas no disco desta
máquina.

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

### Fase 21 — Atualização automática no aparelho (avaliada em 2026-08-29, não iniciada)

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

**Conflito a resolver antes, não durante.** Verificar atualização é requisição
de rede recorrente, e a landing promete hoje "nenhuma requisição de rede" e
exibe um contador em zero. A promessa cai junto com a da fase 20 -- as duas
precisam ser reescritas de uma vez, e o texto precisa distinguir *dados
financeiros* (que continuam sem sair do aparelho) de *verificação de versão*
(que passa a existir). São coisas diferentes e a página tem que dizer isso com
todas as letras.

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
