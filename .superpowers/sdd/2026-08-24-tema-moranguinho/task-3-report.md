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

- A cobertura solicitada é de markup estático; ela protege a presença das quatro opções, mas não simula interação de teclado, persistência ou troca dinâmica da mídia.
- Alterações preexistentes em `ROADMAP.md`, `src-tauri/src/migrations.rs`, `.superpowers/brainstorm/` e `docs/superpowers/plans/2026-08-24-importacao-csv-itau.md` permanecem fora deste escopo e não devem entrar no commit.
