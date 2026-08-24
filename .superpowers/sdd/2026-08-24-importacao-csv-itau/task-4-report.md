# Task 4 — Prévia e confirmação na tela de Movimentações

## Resultado

Implementada a orquestração local da importação CSV na tela de Movimentações e a superfície de revisão acessível. O fluxo seleciona e lê o arquivo localmente, usa o parser e a reconciliação existentes, exige revisão das linhas importáveis e confirma somente por `confirmStatementImport`.

Commit: `98ddb3b feat: revisar importacao de extrato`

## Implementação

### Entrada e orquestração

- Adicionada a ação acessível **Importar extrato** ao lado de **Adicionar**.
- O input de arquivo fica oculto e aceita `.csv,text/csv`; a ação visível possui alvo de 44px, ícone Lucide e rótulo textual.
- Adicionada uma união discriminada para `idle`, `parsing`, `preview`, `confirming` e `error`.
- O fluxo executa, nesta ordem: `File.arrayBuffer()` → `parseItauCsv` → `findReconciliationCandidates` → `reconcileStatement`.
- Falhas de leitura, parsing, conciliação e confirmação possuem mensagens em pt-BR com `role="alert"`; nenhuma informação financeira é enviada ou registrada.
- A confirmação chama exclusivamente `confirmStatementImport`. Não há SQL na UI.
- `onImported(): Promise<void>` recarrega o mês atual e as categorias. Depois de uma confirmação bem-sucedida, a prévia é fechada antes do recarregamento, evitando uma confirmação repetida caso o refresh falhe.
- Em falha de confirmação, a prévia e as escolhas permanecem montadas para correção ou nova tentativa.

### Prévia e revisão

- Criado modal `max-w-5xl` no desktop e superfície fixa de `100dvh` em tela cheia no mobile.
- O cabeçalho mostra o nome do arquivo selecionado.
- O resumo vem antes dos dados e mostra contagens de **Novas**, **Conflitos**, **Duplicadas** e **Com erro**, sempre com ícone e texto.
- A revisão usa tabs acessíveis (`tablist`, `tab`, `tabpanel`) com suporte às setas esquerda/direita.
- Linhas novas começam selecionadas para importação e podem ser explicitamente ignoradas.
- Conflitos começam pendentes e bloqueiam a confirmação até receberem **Importar** ou **Ignorar**.
- Duplicatas e linhas inválidas são somente leitura, com rótulo textual do destino.
- Linhas escolhidas expõem controles de natureza e categoria.
- Sugestões de categoria são comparadas com nomes existentes ignorando caixa, acentos e espaços excedentes. Somente correspondências existentes são pré-selecionadas; sugestões sem correspondência e CSV sem sugestão permanecem sem categoria.
- A confirmação permanece desabilitada enquanto houver conflito pendente, linha escolhida sem categoria ou nenhuma linha escolhida.
- O payload usa a natureza revisada e gera o fingerprint determinístico com `reconciliationKey`.

### Acessibilidade e responsividade

- Diálogo com `aria-modal`, título/descrição associados, bloqueio de scroll do documento, fechamento por Escape, contenção de Tab e restauração do foco ao gatilho.
- Todos os controles diretos da nova UI têm pelo menos 44px de altura e foco visível com offset.
- Rótulos de botões não quebram linha. No mobile, as ações do rodapé são empilhadas para comportar contagens grandes sem overflow.
- O rodapé fica ancorado/sticky dentro da superfície, fora do conteúdo principal rolável, e aplica `env(safe-area-inset-bottom)`.
- Estados não dependem apenas de cor; os rótulos de resumo foram mantidos em cor de texto de alto contraste e diferenciados por ícone/texto.
- O CSS global existente já cobre `prefers-reduced-motion`; a nova UI não introduz animação própria além do spinner de carregamento, que é reduzido pela regra global.
- Temas claro/escuro usam somente tokens Tailwind já existentes.

## TDD e testes

Foi adicionada cobertura pura porque o projeto não possui infraestrutura de teste de componentes e o brief proíbe adicionar dependências.

### RED

Criado `ImportStatementModal.test.ts` antes do componente. O comando:

`npm.cmd test -- src/features/imports/ImportStatementModal.test.ts`

falhou como esperado com `Cannot find module './ImportStatementModal'`. A falha provou que a cobertura dependia da nova unidade de produção.

### GREEN

Após a implementação, o mesmo comando passou com 4/4 testes. Os testes cobrem:

- pré-seleção apenas de categoria existente;
- bloqueio por conflito pendente e categoria ausente;
- geração somente das linhas escolhidas;
- natureza revisada e fingerprint correspondente;
- rejeição defensiva de payload escolhido sem categoria.

Os testes focados do fluxo de importação passaram com 23/23 casos (modal/helpers, parser, reconciliação e repositório).

## Verificação final

Executada após a última alteração e antes do commit:

- `npm.cmd test` — PASS, 11 arquivos e 83 testes.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint` — PASS.
- `npm.cmd run build` — PASS, 2.834 módulos transformados.
- `git diff --check` — PASS.
- Busca read-only confirmou ausência de `getDb`, `.select`, `.execute` ou SQL nos dois componentes da UI.

O build mantém o aviso de chunk principal acima de 500 kB (`713,10 kB`, gzip `218,95 kB`). Não houve mudança de configuração ou code splitting porque isso está fora do escopo desta tarefa.

## Verificação manual e limites

- A porta 1420 estava livre antes do início.
- O Vite iniciou com sucesso em `http://localhost:1420` (`VITE v7.3.6`).
- A conexão de navegador do ambiente não disponibilizou nenhum navegador (`agent.browsers.list()` retornou `[]`). Por isso não foi possível executar honestamente a inspeção visual/interativa em 375px e desktop, nem validar por clique seleção do arquivo, tabs, Escape, bloqueio de categoria e refresh pós-importação.
- O processo Vite iniciado foi encerrado (PID 25672) e `netstat -ano | findstr :1420` confirmou a porta livre ao final.
- Além disso, o Vite isolado não oferece o backend Tauri/`plugin-sql`; a verificação completa com banco precisa usar `npm run tauri dev` em um ambiente com janela desktop disponível.

## Arquivos

- `src/features/imports/ImportStatementModal.tsx` — novo modal, funções puras da revisão e acessibilidade do diálogo.
- `src/features/imports/ImportStatementModal.test.ts` — testes unitários dos contratos de revisão/payload.
- `src/features/transactions/TransactionsScreen.tsx` — seleção do arquivo, estados assíncronos, parser/conciliação/confirmação e reload.

Não foram alterados parser, reconciliação, repositórios, backend, migrações, dependências ou tokens globais.

## Auto-revisão e preocupações

- Requisitos do brief foram conferidos individualmente: ação/accept, estados de loading/erro, quatro contagens, tabs progressivas, duplicatas read-only, decisão explícita de conflitos, categoria sem default indevido, confirmação bloqueada, sticky footer/safe area, foco/teclado, confirmação via repositório e reload pós-sucesso.
- O componente do modal é deliberadamente autocontido, mas ficou extenso (570 linhas) por incluir as quatro apresentações de linha e a gestão acessível do diálogo. Uma futura extração de subcomponentes pode melhorar manutenção, sem necessidade funcional imediata.
- Não há teste DOM do focus trap, tabs ou layout responsivo devido à restrição explícita de não adicionar infraestrutura de componentes. Esses pontos dependem do QA manual pendente.
- O aviso de bundle do Vite permanece como preocupação de desempenho geral, não como falha desta unidade.
- Alterações não relacionadas já presentes no worktree (`ROADMAP.md`, `src-tauri/src/migrations.rs` e outros artefatos `.superpowers`/plano) foram preservadas e não entraram no commit.

---

# Fix round 1/5 — achados importantes da revisão

## Resultado

Todos os cinco achados importantes foram tratados, junto dos três ajustes menores solicitados. A prévia agora mantém todos os alvos de `aria-controls` no DOM, limita arquivos e volume de revisão antes de renderizar, possui bordas de controles com contraste não textual acima de 3:1, usa um controlador puro testado para a sequência da tela e foi verificada no aplicativo Android real em 375 dp. Também houve inspeção do breakpoint amplo em 1080 dp.

## Implementação da correção

### Estado e limites de segurança da UI

- Extraído `importController.ts`, sem dependência de React ou DOM, com a máquina de estados `idle` → `parsing` → `preview` → `confirming`/`error` e a intenção explícita `reloadMonthAndCategories` após sucesso.
- `MAX_IMPORT_FILE_BYTES` foi fixado em 5 MiB. `validateImportFileSize` é executado na tela antes de entrar em parsing e novamente em `readImportFileForReview` antes de qualquer chamada a `arrayBuffer()`.
- `MAX_IMPORT_REVIEW_ROWS` foi documentado em 500 linhas. O total de linhas válidas e issues é verificado depois do parser e antes de conciliação/criação da prévia, com erro seguro em pt-BR orientando exportar período menor.
- A confirmação só muda para `confirming` quando existe pelo menos uma linha e todas as categorias do payload são não vazias. Falha de repositório mantém a mesma prévia e escolhas; sucesso fecha e emite a intenção de recarregar mês e categorias.

### Tabs, categorias e estado inicial

- Os quatro `tabpanel` são sempre renderizados com IDs estáveis (`new`, `conflict`, `duplicate`, `issue`); os inativos usam `hidden` e `tabIndex=-1`. Assim, todo `aria-controls` aponta para um elemento existente durante toda a vida do modal.
- A aba inicial agora escolhe o primeiro grupo não vazio na prioridade acionável: novas, conflitos, duplicadas e erros.
- Sugestões de categoria são sincronizadas quando categorias carregam depois da prévia. A sincronização preenche somente linhas ainda vazias e nunca sobrescreve escolha explícita do usuário.

### Contraste e disabled

- Criado o token semântico `--control-border`, exposto como `border-control-border`: `#64748b` no tema claro e `#94a3b8` no escuro.
- Contraste calculado para o contorno: claro/fundo 4,76:1; claro/surface 4,55:1; escuro/fundo 6,96:1; escuro/surface 6,72:1. Todos excedem o mínimo de 3:1 para limites de controles.
- Select de categoria e grupo segmentado de natureza usam o token. O estado desabilitado não reduz a opacidade do contorno; usa fundo/texto semânticos e cursor, mantendo a fronteira perceptível.

## TDD e cobertura adicionada

### RED

Os testes foram escritos antes da produção em duas etapas:

1. A primeira execução falhou porque `importController.ts`, `syncSuggestedCategories` e `getInitialReviewTab` não existiam; o teste SSR também demonstrou que três IDs controlados estavam ausentes e que a aba inicial incorreta era “Novas · 0”.
2. Depois, foram adicionados testes de limite que falharam pela ausência de `readImportFileForReview`, inclusive a asserção de que arquivo acima de 5 MiB não poderia chamar `arrayBuffer()`.

### GREEN e verificação final

- Focados: `npm.cmd test -- src/features/imports/importController.test.ts src/features/imports/ImportStatementModal.test.ts src/features/imports/ImportStatementModal.markup.test.tsx` — PASS, 3 arquivos/17 testes.
- Suite completa: `npm.cmd test` — PASS, 13 arquivos/96 testes.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint` — PASS.
- `npm.cmd run build` — PASS, 2.835 módulos transformados.
- `git diff --check` — PASS.

Os testes puros cobrem parsing→prévia, falha de confirmação preservando prévia/erro, sucesso fechando com intenção de reload, gate de categoria, limite de arquivo antes da leitura, limite de 500 linhas, sincronização tardia de categorias, prioridade da aba inicial e integridade `aria-controls`/`tabpanel` no markup SSR.

## QA visual manual

- Executado `npm.cmd run tauri -- android dev` no AVD `Teste`; build Gradle, instalação e inicialização concluíram.
- Mobile exato: o emulador foi temporariamente configurado em `1080x2400 @ 461 dpi`; `dumpsys` confirmou `sw375dp w375dp h833dp`. A tela de Movimentações foi inspecionada e a prévia foi aberta com um CSV de três linhas.
- Evidência mobile da tela: `task4-mobile-transactions.png` — ações lado a lado, seletor, cards e navegação sem overflow.
- Evidência mobile da prévia: `task4-mobile-preview-final.png` — título/nome, quatro contagens, tabs, primeiro card, categoria com contorno visível e CTA bloqueado por uma categoria ausente, sem overflow horizontal em 375 dp.
- Breakpoint amplo: densidade temporária de 160 dpi produziu `sw1080dp w1080dp h2400dp`; `task4-wide-transactions.png` confirma sidebar, ações, filtros e cards no layout desktop sem colisões.
- Limite da evidência ampla: o seletor nativo de arquivo recriou a Activity ao retornar no viewport de 1080 dp e voltou à rota inicial, portanto o modal completo no breakpoint amplo não pôde ser capturado honestamente nessa sessão. O markup/responsividade do modal continuam cobertos por inspeção de código, SSR e build, mas a interação desktop nativa permanece uma verificação manual recomendada.
- O Android 16 exibiu aviso do ambiente de build de que `libtauri_app_lib.so` x86_64 não está alinhada para páginas de 16 KiB. A aplicação rodou em modo compatível; o achado é externo à UI desta tarefa e deve ser tratado no pipeline Android/Tauri.
- Ao final, `wm density reset` restaurou os 420 dpi físicos. O processo Tauri/Vite foi encerrado e `netstat -ano | findstr :1420` mostrou apenas `TIME_WAIT`, sem processo `LISTENING`.

## Arquivos da correção

- `src/features/imports/importController.ts` — controlador puro, limites e leitura protegida.
- `src/features/imports/importController.test.ts` — sequência de integração da tela e limites.
- `src/features/imports/ImportStatementModal.tsx` — painéis estáveis, sync tardio, aba inicial e estados visuais.
- `src/features/imports/ImportStatementModal.test.ts` — categoria tardia e prioridade de aba.
- `src/features/imports/ImportStatementModal.markup.test.tsx` — contrato SSR de tabs/painéis.
- `src/features/transactions/TransactionsScreen.tsx` — integração com controlador, limite antes da leitura e intenção de reload.
- `src/index.css` — token semântico de borda de controle nos dois temas.

## Auto-revisão e preocupações

- Parser, reconciliação, repositórios, backend, migrações e dependências não foram alterados nesta correção.
- O limite de 500 é intencionalmente conservador porque cada linha importável monta vários controles; ele impede um DOM inutilizável e oferece erro antes da conciliação/renderização. Paginação/virtualização pode substituir esse limite no futuro se houver necessidade de períodos maiores.
- Todos os painéis continuam montados, mas somente até o teto de 500 linhas e somente o painel ativo participa da navegação por foco.
- O aviso existente de chunk acima de 500 kB permanece (`715,18 kB`, gzip `219,64 kB`) e não foi ampliado para uma mudança de arquitetura fora do escopo.
- Alterações concorrentes/não relacionadas em `ROADMAP.md`, `src-tauri/src/migrations.rs`, planos e demais artefatos foram preservadas e excluídas do commit da correção.
