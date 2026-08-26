# Integração Visual do Tema Moranguinho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir o tema Moranguinho no aplicativo com o fundo aprovado, marcadores de categoria em forma de morango e os mascotes Custard e Pupcake posicionados com segurança nos cards do Resumo.

**Architecture:** Preservar os três temas já disponíveis (Claro, Escuro e Moranguinho), os cálculos e os repositórios existentes. Centralizar os assets locais e extrair a composição de cards do Resumo para um componente testável. A imagem de fundo será aplicada somente pela camada decorativa de theme-shell, atrás de superfícies opacas e fora da árvore de acessibilidade.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS 4, Vite, Vitest, Motion e assets locais PNG/AVIF.

**Spec:** docs/superpowers/specs/2026-08-24-tema-moranguinho-design.md; a linha visual aprovada está em mockups/reference-background-preview.html.

## Amendment — 2026-08-26

A instrução direta da usuária substitui a especificação anterior somente quanto à escolha de aparência: o aplicativo mantém exclusivamente **Claro**, **Escuro** e **Moranguinho**. A Task 1 abaixo fica fora da execução; não adicionar, restaurar ou persistir a opção Padrão do sistema, nem alterar o comportamento atual desses três temas.

## Global Constraints

- Não alterar SQLite, migrações, repositórios, SQL, Rust, cálculos financeiros, telemetria, importação CSV ou semântica dos gráficos.
- Usar somente os assets fornecidos pela usuária e existentes em mockups/; não baixar imagens nem adicionar dependências.
- Fundo e mascotes são puramente decorativos: sem foco, eventos de ponteiro ou texto alternativo.
- Morangos substituem pontos de categoria somente no tema strawberry; os demais temas preservam pontos circulares.
- Custard fica exclusivamente em Realizado; Pupcake, exclusivamente em Projeção. Nenhum dos dois fica no gráfico.
- Cards decorados reservam espaço à direita e mantêm conteúdo acima da arte, com valores sem quebra de linha.
- Não adicionar Padrão do sistema, matchMedia ou uma quarta preferência de aparência.
- Toda mudança de produção vem após o teste RED correspondente.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| src/features/theme/themePreference.ts | Validar/resolver system, light, dark e strawberry. |
| src/features/theme/ThemeProvider.tsx | Aplicar tema e acompanhar matchMedia apenas para system. |
| src/features/theme/AppearanceSelector.tsx | Expor quatro escolhas acessíveis. |
| src/features/theme/strawberryAssets.ts | Exportar manifestos de reações e decoração. |
| src/assets/moranguinho/{custard,pupcake,strawberry-background} | Assets locais aprovados. |
| src/index.css | Tokens e camada de fundo responsiva. |
| src/components/ui/CategoryMarker.tsx | Morango colorido ou ponto normal conforme o tema. |
| src/features/dashboard/DashboardSummaryCards.tsx | Saldo, Realizado/Custard e Projeção/Pupcake. |
| src/features/dashboard/DashboardScreen.tsx | Integrar totais existentes à nova composição. |

---

### Task 1: Restaurar o contrato de preferência de aparência

**Files:**

- Modify: src/features/theme/themePreference.ts
- Modify: src/features/theme/themePreference.test.ts
- Modify: src/features/theme/ThemeProvider.tsx
- Modify: src/features/theme/AppearanceSelector.tsx
- Modify: src/features/theme/AppearanceSelector.markup.test.tsx

**Interfaces:**

- Produces: ThemePreference = "system" | "light" | "dark" | "strawberry".
- Produces: ResolvedTheme = "light" | "dark" | "strawberry".
- Produces: resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme.
- Consumes: window.matchMedia("(prefers-color-scheme: dark)") only while preference is system.

- [ ] **Step 1: Write the failing preference tests**

~~~ts
test("falls back to system when preference is invalid or storage fails", () => {
  expect(readThemePreference({ getItem: () => "invalid" })).toBe("system");
  expect(readThemePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
});

test("resolves system from the device but leaves forced preferences unchanged", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("strawberry", true)).toBe("strawberry");
});
~~~

- [ ] **Step 2: Run RED**

Run: npm.cmd test -- src/features/theme/themePreference.test.ts
Expected: FAIL because system is not a valid preference and resolveTheme has no device argument.

- [ ] **Step 3: Implement the minimal preference and provider contract**

~~~ts
const THEME_PREFERENCES = ["system", "light", "dark", "strawberry"] as const;

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
~~~

In ThemeProvider, create one MediaQueryList defensively, initialize from media.matches, subscribe with addEventListener("change", listener) only for system and clean it up on change/unmount. Apply document.documentElement.dataset.theme from the resolved value. In AppearanceSelector, add Padrão do sistema before forced choices, retaining menuitemradio, Escape, arrows, focus management and 44 px targets.

- [ ] **Step 4: Extend the selector expectation**

~~~tsx
for (const label of ["Padrão do sistema", "Claro", "Escuro", "Moranguinho"]) {
  expect(markup).toContain(label);
}
~~~

- [ ] **Step 5: Run GREEN and typecheck**

Run: npm.cmd test -- src/features/theme/themePreference.test.ts src/features/theme/AppearanceSelector.markup.test.tsx
Expected: PASS.

Run: npm.cmd run typecheck
Expected: exit code 0.

- [ ] **Step 6: Commit**

~~~bash
git add src/features/theme/themePreference.ts src/features/theme/themePreference.test.ts src/features/theme/ThemeProvider.tsx src/features/theme/AppearanceSelector.tsx src/features/theme/AppearanceSelector.markup.test.tsx
git commit -m "fix: restaurar preferencia de tema do sistema"
~~~

### Task 2: Empacotar os assets aprovados e aplicar o fundo de referência

**Files:**

- Create: src/assets/moranguinho/custard.png (copiar de mockups/custard.png)
- Create: src/assets/moranguinho/pupcake.png (copiar de mockups/pupcake-transparent.png)
- Create: src/assets/moranguinho/strawberry-background.avif (copiar do AVIF de referência em mockups/)
- Modify: src/features/theme/strawberryAssets.ts
- Create: src/features/theme/strawberryAssets.test.ts
- Modify: src/index.css

**Interfaces:**

- Produces: STRAWBERRY_DECORATIVE_ASSETS = { custard: string; pupcake: string }.
- Consumes: STRAWBERRY_MOOD_ASSETS sem mudar faixas, mensagens ou alt das reações.
- Produces: fundo em .theme-shell::before somente para data-theme="strawberry".

- [ ] **Step 1: Write the failing asset-manifest test**

~~~ts
import { STRAWBERRY_DECORATIVE_ASSETS } from "./strawberryAssets";

test("declares transparent mascots for the summary cards", () => {
  expect(STRAWBERRY_DECORATIVE_ASSETS.custard).toContain("custard");
  expect(STRAWBERRY_DECORATIVE_ASSETS.pupcake).toContain("pupcake");
  expect(STRAWBERRY_DECORATIVE_ASSETS.pupcake).not.toContain(".jpg");
});
~~~

- [ ] **Step 2: Run RED**

Run: npm.cmd test -- src/features/theme/strawberryAssets.test.ts
Expected: FAIL because STRAWBERRY_DECORATIVE_ASSETS does not exist.

- [ ] **Step 3: Copy assets and export the semantic manifest**

Copiar os três arquivos nomeados para src/assets/moranguinho/. Não copiar o JPG com quadriculado. Importar os dois PNGs em strawberryAssets.ts e exportar:

~~~ts
export const STRAWBERRY_DECORATIVE_ASSETS = {
  custard,
  pupcake,
} as const;
~~~

- [ ] **Step 4: Replace the inline pattern with the approved background**

Aplicar tokens aprovados: background #F2CBD1, surface #FFFCFD, foreground #3F1427, muted-foreground #704458, border #E9B6C8, primary #A61E55 e ring #8D1748. Substituir a data URI de .theme-shell::before pelo AVIF local, com background-size: cover, background-position: center, background-repeat: no-repeat, pointer-events: none e z-index: 0. Manter filhos de theme-shell em z-index: 1 e cards/sidebar/header opacos.

- [ ] **Step 5: Run GREEN and build**

Run: npm.cmd test -- src/features/theme/strawberryAssets.test.ts
Expected: PASS.

Run: npm.cmd run build
Expected: exit code 0 e Vite resolve AVIF/PNGs.

- [ ] **Step 6: Commit**

~~~bash
git add src/assets/moranguinho/custard.png src/assets/moranguinho/pupcake.png src/assets/moranguinho/strawberry-background.avif src/features/theme/strawberryAssets.ts src/features/theme/strawberryAssets.test.ts src/index.css
git commit -m "feat: aplicar fundo e mascotes do tema Moranguinho"
~~~

### Task 3: Substituir os pontos de categoria por morangos temáticos

**Files:**

- Create: src/components/ui/CategoryMarker.tsx
- Create: src/components/ui/CategoryMarker.markup.test.tsx
- Modify: src/features/dashboard/CategoryBreakdown.tsx
- Modify: src/features/categories/CategoriesScreen.tsx
- Modify: src/features/transactions/TransactionList.tsx

**Interfaces:**

- Produces: CategoryMarker({ color, strawberry, size? }: { color: string; strawberry: boolean; size?: "compact" | "default" }).
- Consumes: a cor persistida da categoria, sem alterar dados.
- Produces: SVG de morango com aria-hidden no Moranguinho e span circular nos demais temas.

- [ ] **Step 1: Write the failing component test**

~~~tsx
test("renders a colored strawberry only for the strawberry theme", () => {
  const berry = renderToStaticMarkup(<CategoryMarker color="#ff9815" strawberry />);
  const dot = renderToStaticMarkup(<CategoryMarker color="#ff9815" strawberry={false} />);

  expect(berry).toContain('data-category-marker="berry"');
  expect(berry).toContain("#ff9815");
  expect(dot).toContain('data-category-marker="dot"');
});
~~~

- [ ] **Step 2: Run RED**

Run: npm.cmd test -- src/components/ui/CategoryMarker.markup.test.tsx
Expected: FAIL because CategoryMarker does not exist.

- [ ] **Step 3: Implement the marker**

O SVG tem corpo preenchido por color, folhas #4B8B45, sementes #FFE6A3 e contorno escuro; usar focusable="false" e aria-hidden="true". Quando strawberry for false, renderizar o ponto circular atual. Usar size compact na lista de transações e default em Categorias/Detalhamento.

- [ ] **Step 4: Integrate all current generic category dots**

Em CategoryBreakdown, CategoriesScreen e TransactionList, obter resolvedTheme por useTheme no escopo mais próximo e substituir somente o span com rounded-full e backgroundColor da categoria. Passar a cor existente e strawberry={resolvedTheme === "strawberry"}. Não alterar swatches de formulário, pills de status, barras de orçamento ou células do gráfico.

- [ ] **Step 5: Run GREEN and regressions**

Run: npm.cmd test -- src/components/ui/CategoryMarker.markup.test.tsx
Expected: PASS.

Run: npm.cmd test -- src/features/categories src/features/transactions src/features/dashboard
Expected: PASS; nomes e valores monetários continuam no markup.

- [ ] **Step 6: Commit**

~~~bash
git add src/components/ui/CategoryMarker.tsx src/components/ui/CategoryMarker.markup.test.tsx src/features/dashboard/CategoryBreakdown.tsx src/features/categories/CategoriesScreen.tsx src/features/transactions/TransactionList.tsx
git commit -m "feat: usar morangos como marcadores de categoria"
~~~

### Task 4: Compor os cards do Resumo com Custard e Pupcake

**Files:**

- Create: src/features/dashboard/DashboardSummaryCards.tsx
- Create: src/features/dashboard/DashboardSummaryCards.markup.test.tsx
- Modify: src/features/dashboard/BalanceMoodCard.tsx
- Modify: src/features/dashboard/BalanceMoodCard.markup.test.tsx
- Modify: src/features/dashboard/DashboardScreen.tsx

**Interfaces:**

- Produces: DashboardSummaryCards({ realizedCents, projectedCents, strawberry }: { realizedCents: number; projectedCents: number; strawberry: boolean }).
- Consumes: BalanceMoodCard, formatSignedBRL, STRAWBERRY_DECORATIVE_ASSETS e a política atual de cor de sinal.
- Produces: 3 cards no Moranguinho (saldo, Realizado/Custard, Projeção/Pupcake) e os 2 cards atuais nos demais temas.

- [ ] **Step 1: Write the failing composition tests**

~~~tsx
test("places Custard in Realizado and Pupcake in Projeção only for Moranguinho", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards realizedCents={375000} projectedCents={480000} strawberry />,
  );

  expect(markup).toMatch(/Realizado[\s\S]*custard/);
  expect(markup).toMatch(/Projeção[\s\S]*pupcake/);
  expect(markup).toContain("pr-28");
  expect(markup).toContain("whitespace-nowrap");
});

test("does not render decorative mascots outside Moranguinho", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards realizedCents={375000} projectedCents={480000} strawberry={false} />,
  );

  expect(markup).not.toContain("custard");
  expect(markup).not.toContain("pupcake");
});
~~~

- [ ] **Step 2: Run RED**

Run: npm.cmd test -- src/features/dashboard/DashboardSummaryCards.markup.test.tsx
Expected: FAIL because DashboardSummaryCards does not exist.

- [ ] **Step 3: Implement the non-overlapping responsive composition**

Criar uma grade de uma coluna no celular e xl:grid-cols-[1.05fr_repeat(2,minmax(0,1fr))] no Moranguinho. BalanceMoodCard ocupa a primeira célula. Realizado usa Custard e Projeção usa Pupcake do manifesto. Cada card decorado recebe relative overflow-hidden pr-28; o conteúdo recebe relative z-10; o valor recebe whitespace-nowrap tabular-nums; e a imagem recebe pointer-events-none absolute bottom-1 right-2 z-0 h-27 w-23 object-contain, alt vazio e aria-hidden.

Manter Custard fora de ExpensePieChart, CategoryBreakdown e do card do gráfico. Atualizar BalanceMoodCard para caber como célula de grade, preservando alt contextual da reação e reduced motion.

- [ ] **Step 4: Replace only the inline summary in DashboardScreen**

Manter estados de carregamento/erro/vazio, consultas e calculateMonthlyResult. No bloco hasData, substituir o grid inline por:

~~~tsx
<DashboardSummaryCards
  realizedCents={summary.realized_cents}
  projectedCents={summary.projected_cents}
  strawberry={resolvedTheme === "strawberry"}
/>
~~~

ExpensePieChart mantém slices e summary.projected_cents exatamente como hoje.

- [ ] **Step 5: Run GREEN and dashboard regressions**

Run: npm.cmd test -- src/features/dashboard/DashboardSummaryCards.markup.test.tsx src/features/dashboard/BalanceMoodCard.markup.test.tsx src/features/dashboard/balanceMood.test.ts
Expected: PASS.

Run: npm.cmd run typecheck
Expected: exit code 0.

- [ ] **Step 6: Commit**

~~~bash
git add src/features/dashboard/DashboardSummaryCards.tsx src/features/dashboard/DashboardSummaryCards.markup.test.tsx src/features/dashboard/BalanceMoodCard.tsx src/features/dashboard/BalanceMoodCard.markup.test.tsx src/features/dashboard/DashboardScreen.tsx
git commit -m "feat: compor resumo Moranguinho com Custard e Pupcake"
~~~

### Task 5: Verificar regressões, responsividade e acessibilidade

**Files:**

- Modify: ROADMAP.md only if it already tracks the completed theme milestone.

**Interfaces:**

- Consumes: todas as tarefas anteriores.
- Produces: evidência de regressões limpas e validação visual do tema.

- [ ] **Step 1: Execute a suíte completa**

Run: npm.cmd test
Expected: 0 testes falhos.

Run: npm.cmd run lint
Expected: exit code 0.

Run: npm.cmd run build
Expected: exit code 0.

Run: git diff --check
Expected: nenhuma linha com whitespace inválido.

- [ ] **Step 2: Verifique no aplicativo**

Verificar a porta 1420 com netstat -ano | findstr :1420 e encerrar somente processo Vite órfão. Iniciar npm run tauri dev e conferir em 375 px e desktop amplo:

1. system, Claro, Escuro e Moranguinho selecionam/persistem; só system segue o dispositivo.
2. O AVIF ocupa o fundo sem distorção, fica atrás de cards opacos e não intercepta clique/foco.
3. Marcadores viram morangos somente no Moranguinho; nome, valor e porcentagem permanecem legíveis.
4. Custard aparece apenas em Realizado, Pupcake apenas em Projeção, ambos transparentes e sem tocar nos valores.
5. O gráfico não recebe mascote sobre valores, percentuais, legenda ou tooltip.
6. Movimento reduzido desabilita transição; foco e alvos de 44×44 px permanecem acessíveis.

Encerrar Vite/Tauri iniciado para esta verificação ao final.

- [ ] **Step 3: Registrar e commit final**

Se ROADMAP.md já possuir a entrada do tema, registrar comandos aprovados e tamanhos validados. Caso contrário, não alterar documentação fora do escopo.

~~~bash
git add ROADMAP.md
git commit -m "docs: registrar validacao do tema Moranguinho"
~~~

## Plan Self-Review

- Task 1 corrige a divergência atual entre a especificação e as três opções implementadas.
- Task 2 usa fundo e mascotes aprovados, incluindo o PNG com alfa real do Pupcake.
- Task 3 cobre os três usos atuais de bolinha de categoria, sem mudar banco ou gráfico.
- Task 4 fixa explicitamente a posição de Custard e evita colisão dos valores em desktop/celular.
- Task 5 cobre testes, build, lint, acessibilidade, responsividade e processos temporários.
