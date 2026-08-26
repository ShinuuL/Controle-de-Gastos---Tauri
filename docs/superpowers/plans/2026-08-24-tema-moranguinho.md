# Tema Moranguinho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar os temas Claro, Escuro, Padrão do sistema e Moranguinho, com reação da personagem ao saldo realizado mensal.

**Architecture:** `ThemeProvider` resolve e persiste a preferência, aplicando `data-theme` na raiz. Tokens CSS definem cada tema. Um módulo puro mapeia centavos às seis reações e o Dashboard passa o saldo realizado a um cartão que consome o manifesto semântico de assets.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS 4, Vite, Vitest e assets locais SVG/PNG.

**Spec:** `docs/superpowers/specs/2026-08-24-tema-moranguinho-design.md`

## Global Constraints

- Não alterar SQLite, migrações, repositórios, SQL, Rust, telemetria ou cálculos existentes.
- Usar apenas os seis PNGs autorizados da planilha e criar somente o SVG local decorativo do morango; nenhum download externo.
- Persistir em `controle-gastos.theme-preference`; leitura/escrita indisponível ou inválida resolve para `system` sem erro.
- `system` acompanha `matchMedia`; preferências forçadas não acompanham o dispositivo.
- Moranguinho usa fundo `#F2CBD1`, morangos desenhados atrás dos cards, cards opacos e decoração fora da árvore acessível.
- A reação usa somente `calculateMonthlyResult(transactions).realized_cents`.
- Fazer cada alteração de produção após um teste RED observado com `npm.cmd test -- <arquivo>`.

---

### Task 1: Preferência e resolução de tema

**Files:**
- Create: `src/features/theme/themePreference.ts`
- Create: `src/features/theme/themePreference.test.ts`

**Interfaces:**
- Produces: `ThemePreference = "system" | "light" | "dark" | "strawberry"`.
- Produces: `ResolvedTheme = "light" | "dark" | "strawberry"`.
- Produces: `readThemePreference`, `writeThemePreference`, `resolveTheme`.

- [ ] **Step 1: Write the failing test**

```ts
expect(readThemePreference({ getItem: () => "invalid" })).toBe("system");
expect(resolveTheme("system", true)).toBe("dark");
expect(resolveTheme("light", true)).toBe("light");
expect(resolveTheme("strawberry", false)).toBe("strawberry");
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/features/theme/themePreference.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal contract**

```ts
export const THEME_STORAGE_KEY = "controle-gastos.theme-preference";
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}
```

Validate with a readonly tuple; wrap `Storage` operations in `try/catch`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm.cmd test -- src/features/theme/themePreference.test.ts`
Expected: PASS.

```bash
git add src/features/theme/themePreference.ts src/features/theme/themePreference.test.ts
git commit -m "feat: persistir preferencia de tema"
```

### Task 2: Reações e assets autorizados

**Files:**
- Create: `src/features/dashboard/balanceMood.ts`
- Create: `src/features/dashboard/balanceMood.test.ts`
- Create: `src/features/theme/strawberryAssets.ts`
- Create: `src/assets/moranguinho/{debt,alert,recovering,steady,happy,celebrating}.png`
- Create: `src/assets/moranguinho/strawberry-pattern.svg`

**Interfaces:**
- Produces: `BalanceMood = "debt" | "alert" | "recovering" | "steady" | "happy" | "celebrating"`.
- Produces: `balanceMoodFor(realizedCents: number): BalanceMood`.
- Produces: `STRAWBERRY_MOOD_ASSETS: Record<BalanceMood, { src: string; alt: string; message: string }>`.

- [ ] **Step 1: Write the failing boundaries test**

```ts
it.each([[-1,"debt"],[0,"alert"],[4_999,"alert"],[5_000,"recovering"],[15_000,"recovering"],[15_001,"steady"],[30_000,"steady"],[30_001,"happy"],[50_000,"happy"],[50_001,"celebrating"]] as const)("maps %i", (cents, mood) => expect(balanceMoodFor(cents)).toBe(mood));
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/features/dashboard/balanceMood.test.ts`
Expected: FAIL because `balanceMoodFor` is absent.

- [ ] **Step 3: Implement and name assets semantically**

Extract `image8,image7,image3,image6,image4,image11` from `CONFIGURAÇÕES` in that order into the six named PNGs. Implement comparisons `<0`, `<5_000`, `<=15_000`, `<=30_000`, `<=50_000`, final fallback. Create the decorative SVG as coral fruit, green leaves and pale seeds, no text.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm.cmd test -- src/features/dashboard/balanceMood.test.ts`
Expected: PASS for all boundaries.

```bash
git add src/features/dashboard/balanceMood* src/features/theme/strawberryAssets.ts src/assets/moranguinho
git commit -m "feat: adicionar reacoes Moranguinho"
```

### Task 3: Provider, tokens e controles de aparência

**Files:**
- Create: `src/features/theme/ThemeProvider.tsx`
- Create: `src/features/theme/AppearanceSelector.tsx`
- Create: `src/features/theme/AppearanceSelector.markup.test.tsx`
- Modify: `src/App.tsx`, `src/index.css`, `src/components/layout/Sidebar.tsx`, `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: contratos da Task 1.
- Produces: `useTheme(): { preference; resolvedTheme; setPreference }` e `AppearanceSelector({ compact?: boolean })`.

- [ ] **Step 1: Write the failing selector test**

```tsx
const markup = renderToStaticMarkup(<AppearanceSelector />);
for (const label of ["Padrão do sistema", "Claro", "Escuro", "Moranguinho"]) expect(markup).toContain(label);
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/features/theme/AppearanceSelector.markup.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement**

`ThemeProvider` atualiza `document.documentElement.dataset.theme`, escuta mídia somente em `system` e fornece contexto. O seletor é botão `Aparência` que abre um menu com quatro `menuitemradio`, fecha em Escape/escolha, fica no rodapé da sidebar e em cabeçalho exclusivo de celular. Converta tokens CSS em seletores explícitos para `light`, `dark`, `strawberry`; o padrão SVG é um pseudo-elemento de baixa opacidade atrás das superfícies.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm.cmd test -- src/features/theme/themePreference.test.ts src/features/theme/AppearanceSelector.markup.test.tsx`
Expected: PASS.

Run: `npm.cmd run typecheck`
Expected: exit code 0.

```bash
git add src/features/theme src/App.tsx src/index.css src/components/layout/Sidebar.tsx src/components/layout/AppShell.tsx
git commit -m "feat: adicionar seletor de aparencia"
```

### Task 4: Cartão de saldo e integração do Dashboard

**Files:**
- Create: `src/features/dashboard/BalanceMoodCard.tsx`
- Create: `src/features/dashboard/BalanceMoodCard.markup.test.tsx`
- Modify: `src/features/dashboard/DashboardScreen.tsx`

**Interfaces:**
- Consumes: `balanceMoodFor` e `STRAWBERRY_MOOD_ASSETS`.
- Produces: `BalanceMoodCard({ realizedCents }: { realizedCents: number })`.

- [ ] **Step 1: Write the failing card test**

```tsx
const markup = renderToStaticMarkup(<BalanceMoodCard realizedCents={-1} />);
expect(markup).toContain("Saldo realizado");
expect(markup).toContain("saldo negativo");
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/features/dashboard/BalanceMoodCard.markup.test.tsx`
Expected: FAIL because the card does not exist.

- [ ] **Step 3: Implement**

Render section, BRL value via `formatSignedBRL`, alt e mensagem do manifesto. Mostrar somente quando `resolvedTheme === "strawberry"`; inserir após cabeçalho/mês e antes dos cards existentes. Passar `summary.realized_cents`, não projeção. Desktop usa arte e texto lado a lado; celular usa largura total; transição de 150–200 ms tem override reduzido.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm.cmd test -- src/features/dashboard/balanceMood.test.ts src/features/dashboard/BalanceMoodCard.markup.test.tsx`
Expected: PASS.

```bash
git add src/features/dashboard/BalanceMoodCard* src/features/dashboard/DashboardScreen.tsx
git commit -m "feat: mostrar reacao no resumo"
```

### Task 5: Verificação e documentação

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Execute regressões**

Run: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`.
Expected: todos os comandos concluem sem erro.

- [ ] **Step 2: Valide visualmente**

No Tauri desktop e Android, confira 375 px e desktop: quatro escolhas, persistência, seis faixas, foco, alvo de toque, ausência de recorte, morangos atrás dos cards e movimento reduzido. Pare o Vite iniciado para a verificação.

- [ ] **Step 3: Atualize e faça commit**

Registrar no roadmap a evidência dos testes, build e Android.

```bash
git add ROADMAP.md
git commit -m "docs: registrar tema Moranguinho"
```

## Plan Self-Review

- Tasks 1–4 cobrem persistência, assets, seis limites, tokens, seletor, cartão e acessibilidade; Task 5 cobre regressão e Android.
- Os contratos consumidos por uma task são definidos em task anterior.
- Não há migração, integração externa ou mudança de cálculo fora da especificação.
