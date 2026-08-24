# Task 3 — Provider, tokens e controles de aparência

## RED

Foi criado `src/features/theme/AppearanceSelector.markup.test.tsx` antes da implementação. A execução de `npm.cmd test -- src/features/theme/AppearanceSelector.markup.test.tsx` falhou como esperado, pois o módulo `./AppearanceSelector` ainda não existia.

## GREEN

Foram implementados `ThemeProvider`, `useTheme` e `AppearanceSelector`. O provider persiste a preferência, atualiza `data-theme` no elemento raiz e observa a preferência do sistema somente quando a opção é `system`. O seletor fornece quatro `menuitemradio`, fecha ao escolher uma opção ou com Escape, aparece no rodapé desktop da sidebar e no cabeçalho exclusivo de celular. Os tokens CSS agora têm seletores explícitos para os três temas, e o tema Moranguinho acrescenta um padrão SVG sutil atrás do conteúdo.

## Comandos executados

- `npm.cmd test -- src/features/theme/AppearanceSelector.markup.test.tsx` — RED confirmado: módulo ausente.
- `npm.cmd test -- src/features/theme/themePreference.test.ts src/features/theme/AppearanceSelector.markup.test.tsx` — GREEN: 2 arquivos e 6 testes aprovados.
- `npm.cmd run typecheck` — aprovado, saída `tsc --noEmit` sem erros.

## Commit

- `feat: adicionar seletor de aparencia`

## Preocupações

- Os testes atuais cobrem o markup e o cálculo de navegação; eles não simulam foco real no DOM, persistência ou troca dinâmica da mídia.
- Alterações preexistentes em `ROADMAP.md`, `src-tauri/src/migrations.rs`, `.superpowers/brainstorm/` e `docs/superpowers/plans/2026-08-24-importacao-csv-itau.md` permanecem fora deste escopo e não devem entrar no commit.

## Correção — round 1/5

### RED

- `AppearanceSelector.markup.test.tsx` passou a exigir que o menu compacto use `top-full` e não `bottom-full`; falhou porque o menu era sempre posicionado acima do gatilho.
- `AppearanceSelector.keyboard.test.ts` passou a exigir a navegação circular por ArrowUp/ArrowDown e os atalhos Home/End; falhou porque `getNextMenuItemIndex` ainda não existia.

### GREEN

- O menu compacto agora abre abaixo do botão no cabeçalho móvel; a variante desktop preserva `bottom-full`.
- Escape fecha o menu e devolve o foco ao botão que o abriu.
- Os `menuitemradio` movimentam o foco entre si com ArrowUp, ArrowDown, Home e End.

### Comandos executados

- `npm.cmd test -- src/features/theme/AppearanceSelector.markup.test.tsx` — RED do posicionamento compacto confirmado.
- `npm.cmd test -- src/features/theme/AppearanceSelector.keyboard.test.ts` — RED da navegação de teclado confirmado.
- `npm.cmd test -- src/features/theme/themePreference.test.ts src/features/theme/AppearanceSelector.markup.test.tsx src/features/theme/AppearanceSelector.keyboard.test.ts` — GREEN: 3 arquivos e 8 testes aprovados.
- `npm.cmd run typecheck` — aprovado, saída `tsc --noEmit` sem erros.

### Commit

- `fix: corrigir navegacao do seletor de aparencia`
