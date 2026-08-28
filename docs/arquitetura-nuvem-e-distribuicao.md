# Arquitetura — nuvem, login, pagamento e distribuição

Status: **desenho aprovado, não implementado.** O código correspondente existe
apenas como placeholder inerte (ver "Placeholders já criados").

---

## 1. Por que a atualização quebra em alguns celulares

Esta é a causa raiz do problema relatado, e ela **não é resolvida pela nuvem**.

O `tauri-plugin-sql` usa o migrator do `sqlx`, que valida o checksum de cada
migração já aplicada (`sqlx-core/src/migrate/migrator.rs:175`): se o SQL de uma
migração muda depois de aplicada, ele aborta com `VersionMismatch`.

Em algum momento a migração `v1` foi **editada no lugar** para incluir as colunas
`nature` e `status`. O commit `aaddbef` corrigiu isso para frente — reverteu a
`v1` ao SQL original e criou a `v3` com `ALTER TABLE ADD COLUMN`. Correto, mas
divide a base instalada em duas populações:

| População | Primeira instalação | O que acontece ao atualizar |
|---|---|---|
| A | Build com a `v1` original | `v1` confere, `v3` adiciona as colunas. **Funciona.** |
| B | Build com a `v1` já editada | O checksum gravado da `v1` é o da versão editada e não bate com o código atual → `VersionMismatch(1)`. Se passasse, a `v3` ainda falharia com *duplicate column name: nature*. **App morre no boot.** |

O `getDb()` é um singleton lazy: a falha ocorre em `Database.load()`, antes de
qualquer tela renderizar. Por isso o app simplesmente não abre, em vez de
mostrar erro em uma tela específica.

**Consequência para o plano:** subir o banco para a nuvem não conserta a
população B, porque o erro acontece na inicialização do SQLite local, antes de
qualquer código de rede rodar. É preciso um caminho de reparo explícito —
detectar `VersionMismatch` no boot e oferecer recuperação — e ele precisa
existir **antes** de a nuvem virar útil, senão o usuário nem chega à tela de
login para restaurar o backup.

---

## 2. Topologia

```
  navegador                    backend                      app instalado
  ─────────                    ───────                      ─────────────
  landing page                 API + webhooks               APK gated
   ├── download APK            ├── /v1/auth/*               ├── login (mesma conta)
   ├── login  ────────────────▶├── /v1/me/entitlement ◀─────┤ revalida a cada sync
   └── pagamento               ├── /v1/sync/*               └── SQLite local (leitura)
        ├── Stripe ───webhook─▶│
        └── PIX QR ──webhook──▶└── entitlement               APK direct
                                    ▲     origin=webhook     └── 100% local, sem rede
  painel admin (voce)               │
   ├── fila de reconciliacao        │
   └── liberar manualmente ─────────┘  origin=manual + auditoria
```

O painel administrativo é o caminho de exceção quando o webhook não resolve
(seção 5). O app instalado não distingue as duas origens: para ele, `ativo` é
`ativo`.

A conta é uma só: o mesmo `user_id` autentica na landing page e no app.

---

## 3. Os dois APKs

Mesmo código-fonte, canal definido em tempo de build por `VITE_DISTRIBUTION`:

| Canal | Variável | Distribuição | Login | Pagamento | Rede |
|---|---|---|---|---|---|
| `gated` | `VITE_DISTRIBUTION=gated` | download no site | exigido | exigido | sim |
| `direct` | ausente ou `direct` | você entrega o APK | não | não | nenhuma |

O padrão é `direct`, então um build sem a variável se comporta exatamente como
o app hoje. Isso mantém o comportamento atual como caso base e evita que um
esquecimento de configuração transforme o app offline em app quebrado.

> **Os dois APKs precisam de `applicationId` diferentes** se você quiser os dois
> instalados no mesmo aparelho. Com o mesmo id, um substitui o outro, e a troca
> entre canais vira desinstalar/reinstalar — o que apaga o banco local.

### O limite real do canal `gated`

Um `if` no cliente decidindo "pagou / não pagou" **não é proteção**: qualquer
pessoa extrai o APK, inverte o booleano e recompila. A regra em
`decideAccess()` serve para a UI saber o que mostrar, não para proteger receita.

A proteção precisa estar no backend: se os dados do usuário só existem na
nuvem e a API recusa responder sem entitlement ativo, o cliente adulterado não
tem o que exibir.

**Decisão tomada (2026-08-27): local-first, com revalidação periódica.** O
SQLite local continua sendo a fonte de leitura e o app funciona offline; a
nuvem é réplica e ponto de restauração. A consequência aceita explicitamente é
que, depois do primeiro login, os dados estão no aparelho e o bypass do
entitlement é possível. Pirataria de um app de finanças pessoais pesa menos que
perder o funcionamento offline, que é a razão de o app existir.

A alternativa descartada era cloud-first (dados só na nuvem): tornaria o bypass
inútil, ao custo de o app não abrir sem internet.

---

## 4. Pagamento: compra única

**Decidido (2026-08-27): compra única, sem assinatura.**

Duas consequências diretas:

1. **O entitlement não vence.** Não existe estado `expirado`, e a pergunta "o
   que acontece quando a assinatura vence num app local-first" — que era o
   problema mais espinhoso do desenho, porque implicaria trancar o usuário fora
   dos próprios registros financeiros — simplesmente deixa de existir. O único
   caminho para perder acesso é estorno, coberto pelo estado `revogado`.
2. **A recorrência sai da comparação**, e com ela a maior vantagem do Stripe.

| | Stripe | PIX (QR estático/dinâmico) |
|---|---|---|
| Confirmação | webhook automático | precisa de PSP com webhook, ou conferência manual |
| ~~Recorrência~~ | ~~nativa~~ | ~~manual~~ — irrelevante em compra única |
| Custo | ~4,4% + taxa fixa | ~1% ou menos |
| Entrada em produção | conta + verificação | chave PIX já resolve o recebimento |
| Estorno | contestação de cartão | MED (Mecanismo Especial de Devolução) |

O ponto que decide: **entitlement automático exige webhook.** Um QR PIX estático
recebe dinheiro mas não avisa ninguém — alguém teria que marcar o pagamento na
mão.

Com compra única, o PIX fica bem mais atraente: pagamento é evento isolado, a
taxa é ~4x menor e não há cobrança repetida para administrar. O custo é que
**o painel administrativo (seção 5) deixa de ser opcional e vira obrigatório**,
porque a reconciliação manual passa a ser parte do fluxo normal, não exceção.

Em ambos os casos, o backend é o único que escreve `entitlement` — nunca a
partir de uma chamada do cliente dizendo "eu paguei". As duas origens legítimas
de escrita são o **webhook** do provedor e a **liberação manual** feita por você
no painel administrativo (seção 5).

---

## 5. Painel administrativo

Existe porque o PIX tem um furo que o Stripe não tem: o dinheiro pode entrar
sem o entitlement liberar. QR estático não notifica ninguém; QR dinâmico via
PSP notifica, mas o webhook pode falhar, chegar fora de ordem, ou o pagamento
pode vir com valor divergente ou de uma conta que não casa com o cadastro.
Sem uma tela para intervir, o usuário pagou e ficou travado, e o único caminho
seria mexer no banco à mão.

### O que a tela precisa mostrar

Uma fila de reconciliação, não um CRUD de usuários:

| Coluna | Para quê |
|---|---|
| Conta (email, `user_id`) | identificar quem está travado |
| Estado do entitlement | `ativo` / `pendente` / `expirado` / `ausente` |
| Pagamentos recebidos | valor, data, `end_to_end_id` do PIX ou `payment_intent` do Stripe |
| Origem do estado atual | `webhook` ou `manual` |
| Divergência | pagamento sem conta correspondente, ou conta pendente sem pagamento |

As duas listas que resolvem 100% dos casos do dia a dia: **contas pendentes com
pagamento recebido** (liberar) e **pagamentos recebidos sem conta identificada**
(procurar o dono).

### Liberação manual

Ação: `POST /v1/admin/entitlement` com `user_id`, novo estado, referência do
pagamento e **justificativa obrigatória**.

Grava um registro imutável de auditoria com quem liberou, quando, qual
pagamento sustenta a decisão e o motivo. Isso não é burocracia: sem o vínculo
entre liberação e pagamento, em três meses não há como fechar quanto entrou
contra quantos acessos foram concedidos, e uma liberação errada (ou indevida)
fica indistinguível de uma correta.

Por isso o entitlement carrega o campo `origin`: um estado `ativo` com
`origin = "manual"` é auditável e reversível; sem esse campo ele fica idêntico
a um pagamento confirmado que nunca existiu.

### Segurança

Esta é a superfície mais sensível do sistema inteiro — quem entra aqui concede
acesso pago de graça.

- Autenticação **separada** da conta de usuário comum, não uma flag `is_admin`
  na mesma tabela: um comprometimento da conta de usuário não pode virar acesso
  administrativo.
- Segundo fator obrigatório.
- Rotas `/v1/admin/*` isoladas, negadas por padrão, com rate limit próprio.
- Toda ação registrada em log de auditoria append-only, incluindo consultas.
- O painel **não** é servido junto da landing page pública.

### Onde isso mora

No site, não neste repositório. O app Tauri só consome `/v1/me/entitlement` e
não sabe se o estado veio de webhook ou de liberação manual — para ele, `ativo`
é `ativo`. Nenhuma mudança no cliente é necessária para o painel funcionar.

---

## 6. LGPD

> **Não é parecer jurídico.** Sou engenharia, não advocacia, e "ter certeza" de
> conformidade exige revisão de um advogado. O que está aqui é o desenho técnico
> que sustenta a conformidade e a lista do que precisa existir — a validação
> final é humana e profissional.

Hoje a exposição é **zero**: nada sai do aparelho, e o `AGENTS.md` codifica isso
("telemetria apenas em memória", "sem endpoint HTTP", "não registre dados
financeiros pessoais"). A nuvem muda isso de patamar, e é aí que a lei entra.

### A decisão que muda tudo: criptografia ponta a ponta

Esta é a recomendação mais forte deste documento.

O desenho já define a nuvem como **réplica e ponto de restauração**, não como
fonte de consulta — o SQLite local é quem responde as leituras. Se é só réplica,
o servidor nunca precisa **ler** o conteúdo. Então cifre no aparelho, com chave
derivada da senha do usuário, e suba apenas o blob cifrado.

O que isso muda perante a LGPD:

| Sem E2E | Com E2E |
|---|---|
| Você é controlador de dados financeiros legíveis de todos os usuários | Você guarda blobs que não consegue ler |
| Vazamento expõe as finanças de todo mundo | Vazamento expõe blobs inúteis |
| Incidente exige notificar ANPD e titulares (art. 48) | Risco de dano concreto cai drasticamente |
| Pedido de eliminação exige apagar dados espalhados | Apagar o blob resolve |

O custo é real e precisa ser aceito conscientemente: **perdeu a senha, perdeu o
backup.** Não há "recuperar conta" que devolva os dados, porque você não tem a
chave. Isso precisa estar dito na cara do usuário no momento do cadastro, não
enterrado nos termos.

Como o app é local-first e a nuvem é só restauração, essa troca é boa: o custo
aparece num cenário raro, o benefício vale todo dia.

### O que a lei exige de qualquer forma

| Obrigação | O que fazer aqui |
|---|---|
| **Base legal** (art. 7º) | Execução de contrato — o usuário comprou o app. É a base mais limpa; evita depender de consentimento, que pode ser revogado a qualquer momento |
| **Finalidade e minimização** (art. 6º) | Guardar só email, `user_id` e referência do pagamento. Nada de telemetria de uso sem base própria |
| **Direitos do titular** (art. 18) | Acesso, correção, **portabilidade** e **eliminação**. Exportar já é natural num app local-first; apagar precisa de endpoint real, não de e-mail para suporte |
| **Eliminação de conta** | Apagar de fato o blob e o cadastro, com prazo declarado. Manter só o registro fiscal do pagamento, que tem base legal própria |
| **Transferência internacional** (art. 33) | Cloudflare e Turso rodam fora do Brasil. Precisa de base para transferência internacional e de dizer isso na política |
| **Incidente de segurança** (art. 48) | Procedimento escrito de notificação à ANPD e aos titulares |
| **Encarregado (DPO)** (art. 41) | A Resolução CD/ANPD nº 2/2022 simplifica para agentes de pequeno porte, mas **canal de contato do titular continua obrigatório** |
| **Política de privacidade e termos** | Precisam existir antes do primeiro cadastro real, não depois |

Um esclarecimento que costuma gerar confusão: dado financeiro **não é "dado
sensível"** no sentido do art. 5º, II — a lista é fechada (origem racial, convicção
religiosa, opinião política, filiação sindical, saúde, vida sexual, genético,
biométrico). Ou seja, não incide o regime especial. Mas continua sendo dado
pessoal, e o risco reputacional de um vazamento de finanças pessoais é alto
independentemente da classificação legal.

### Ordem prática

1. Decidir E2E **antes** de escrever a sincronização — refazer depois é caro.
2. Política de privacidade e termos antes do primeiro cadastro real.
3. Endpoint de eliminação de conta junto com o de cadastro, não depois.
4. Revisão por advogado antes de cobrar do primeiro cliente.

---

## 7. Pontos de integração que vão precisar mudar

| Onde | Situação hoje | Mudança necessária |
|---|---|---|
| `src-tauri/tauri.conf.json` | CSP `connect-src 'self' ipc: http://ipc.localhost` | liberar o domínio da API |
| `src-tauri/capabilities/default.json` | `sql:default`, `sql:allow-execute` | permissão de HTTP, se a chamada sair do Rust |
| `src/lib/db.ts` | `getDb()` lança se a migração falhar | detectar `VersionMismatch` e acionar o reparo |
| `src-tauri/src/migrations.rs` | 4 migrações | nunca mais editar migração aplicada |
| Token de sessão | não existe | secure storage do SO, **não** `localStorage` |

---

## 8. Placeholders já criados

Inertes: nenhum faz chamada de rede, e o app continua funcionando como antes.

| Arquivo | Papel |
|---|---|
| `src/lib/cloud/distribution.ts` | canal de build (`gated`/`direct`), padrão `direct` |
| `src/lib/cloud/gateway.ts` | base URL da API; lança `NotConfiguredError` enquanto não configurada |
| `src/lib/cloud/sync.ts` | estados de sincronização e stubs `pushChanges`/`pullChanges` |
| `src/features/auth/session.ts` | tipos de sessão e **`decideAccess()`**, a regra de liberação — testada |
| `src/features/auth/authClient.ts` | contrato pretendido de `/v1/auth/*` e `/v1/me/entitlement` |

`decideAccess()` é a única peça com lógica real, porque é a regra de negócio que
você descreveu e vale fixar em teste antes de existir backend.
