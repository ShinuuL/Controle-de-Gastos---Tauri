# Tema Moranguinho — Especificação de Design

**Data:** 2026-08-24  
**Branch:** `feat/moranguinho-theme`  
**Status:** aprovado para especificação; aguardando revisão deste documento antes do plano de implementação.

## Objetivo

Adicionar ao Controle de Gastos um tema visual opcional chamado **Moranguinho**, preservando as opções Claro, Escuro e Padrão do sistema. No tema Moranguinho, a personagem fornecida pela usuária reage ao saldo realizado do mês selecionado no Resumo, com as mesmas seis faixas da planilha de referência.

O tema é somente de apresentação: não muda transações, cálculos, categorias, importação de CSV, banco de dados ou telemetria.

## Referência e autorização dos assets

- Fonte de referência: `C:\Users\kinga\Downloads\planilha moranguinho.xlsx`.
- A usuária autorizou o uso, neste projeto, de todas as ilustrações contidas nessa planilha.
- A implementação extrairá apenas assets dessa fonte, os versionará no repositório e não fará busca ou download de imagens externas.
- As imagens serão organizadas por papel semântico (reação e decoração), sem expor nomes genéricos do arquivo Excel na interface ou no código de domínio.

## Escopo funcional

### Preferência de aparência

O seletor apresenta quatro escolhas exclusivas:

| Valor persistido | Rótulo na interface | Comportamento |
|---|---|---|
| `system` | Padrão do sistema | Segue a preferência Claro/Escuro do dispositivo em tempo real. |
| `light` | Claro | Força o tema claro atual. |
| `dark` | Escuro | Força o tema escuro atual. |
| `strawberry` | Moranguinho | Aplica os tokens e a decoração deste documento. |

A preferência é persistida em `localStorage` sob a chave `controle-gastos.theme-preference`. Se a chave estiver ausente, corrompida ou indisponível, o app usa `system` sem bloquear a navegação. Não haverá tabela, migração SQLite ou chamada Tauri para essa preferência.

No desktop, o botão **Aparência** fica no rodapé da sidebar e abre um seletor ancorado. No celular, o mesmo controle fica no cabeçalho da tela ativa, sem adicionar uma quarta aba à navegação inferior. O controle deve ser um botão nomeado, operável por teclado e com a opção atual anunciada por tecnologias assistivas.

### Saldo que controla a reação

A reação é calculada no Dashboard a partir de `calculateMonthlyResult(transactions).realized_cents` para o mês selecionado. Portanto:

- entrada realizada soma ao saldo;
- saída realizada subtrai do saldo;
- qualquer movimentação prevista não muda a reação;
- alterar o mês ou recarregar as transações atualiza a reação;
- o saldo vazio é `R$ 0,00` e usa a segunda faixa, como na fórmula da planilha.

O cálculo usa centavos inteiros e possui os seguintes limites exatos:

| Faixa semântica | Intervalo em centavos | Intervalo exibido |
|---|---:|---|
| `debt` | menor que `0` | abaixo de R$ 0,00 |
| `alert` | `0` a `4_999` | R$ 0,00 a R$ 49,99 |
| `recovering` | `5_000` a `15_000` | R$ 50,00 a R$ 150,00 |
| `steady` | `15_001` a `30_000` | R$ 150,01 a R$ 300,00 |
| `happy` | `30_001` a `50_000` | R$ 300,01 a R$ 500,00 |
| `celebrating` | maior que `50_000` | acima de R$ 500,00 |

Esses intervalos reproduzem a lógica da célula `C1` das abas mensais da planilha, que deriva o saldo de entradas menos despesas efetivamente pagas.

### Composição visual

O tema Moranguinho mantém a estrutura existente — sidebar, navegação inferior, formulários, tabelas, modais e gráficos — e troca somente tokens e adornos.

No Dashboard, um cartão de contexto de saldo, colocado após o cabeçalho e antes dos cards Realizado/Projeção, mostra:

- a ilustração correspondente à faixa atual;
- o saldo realizado formatado em BRL;
- um texto curto, objetivo e coerente com a faixa, sem infantilizar mensagens de dívida;
- uma descrição textual acessível da reação e do saldo.

Em telas largas, ilustração e texto ficam lado a lado. Em telas estreitas, o cartão ocupa toda a largura e a ilustração reduz sem cortar rosto, expressão ou conteúdo financeiro.

O fundo do app usa rosa-bebê com morangos soltos e discretos, derivados dos assets fornecidos. O padrão é decorativo: baixa opacidade, sem texto sobre ele e sem competir com conteúdo, gráficos ou controles. Superfícies interativas permanecem opacas ou quase opacas para leitura confiável.

### Tokens Moranguinho

Os tokens abaixo são aplicados somente quando a preferência resolvida é `strawberry`. Valores semânticos já existentes permanecem como contratos de componentes.

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#FFF3F7` | fundo rosa-bebê do app |
| `--surface` | `#FFFCFD` | cards, sidebar e menus |
| `--foreground` | `#3F1427` | texto principal |
| `--muted-foreground` | `#704458` | texto auxiliar |
| `--border` | `#E9B6C8` | limites e divisores |
| `--control-border` | `#A84A6E` | contorno de campos e controles |
| `--primary` | `#A61E55` | ação primária e navegação ativa |
| `--primary-foreground` | `#FFFFFF` | texto sobre ação primária |
| `--secondary` | `#D9467B` | ênfase secundária |
| `--accent` | `#087C68` | estado positivo e destaque complementar |
| `--success` | `#087C68` | feedback positivo |
| `--warning` | `#9A4F00` | alerta legível |
| `--danger` | `#B4234D` | saldo negativo e erro |
| `--ring` | `#8D1748` | foco visível |

O tema não usa rosa como único indicador de significado: sucesso, alerta, erro e seleção conservam contraste, texto e/ou ícone de apoio.

### Movimento e acessibilidade

- A ilustração pode fazer somente uma transição de opacidade/escala de 150–200 ms ao trocar de faixa; não há animação contínua decorativa.
- Com `prefers-reduced-motion: reduce`, a troca é imediata.
- Imagens de reação recebem texto alternativo contextual; o padrão de fundo é CSS decorativo e não entra na árvore de acessibilidade.
- Ações e controles mantêm foco visível, navegação por teclado, alvo de toque mínimo de 44×44 px e contraste de texto de pelo menos 4,5:1.
- Gráficos não mudam suas cores de dados apenas para se adequar ao rosa; qualquer alteração preserva legenda, texto e contraste.

## Arquitetura proposta

1. Um módulo de preferência declara `ThemePreference`, valida valores persistidos e resolve `system` com `matchMedia("(prefers-color-scheme: dark)")`.
2. Um `ThemeProvider` mantém a escolha global, escuta mudança do sistema somente em `system` e aplica `data-theme="light"`, `data-theme="dark"` ou `data-theme="strawberry"` ao elemento raiz.
3. O CSS move os tokens atuais de regras implícitas por mídia para seletores explícitos por `data-theme`; as regras de mídia permanecem somente como resolução do modo `system` pelo provedor.
4. Um componente reutilizável de seletor de aparência é renderizado na sidebar e no cabeçalho móvel, com a mesma fonte de estado.
5. Um módulo puro mapeia `realized_cents` para uma das seis reações. Um componente de cartão consome esse módulo e o manifesto semântico de assets.
6. O Dashboard fornece o resultado realizado já calculado e o mês selecionado; nenhum repositório, SQL ou comando Rust é alterado.

## Erros e estados limite

- Preferência inválida, `localStorage` indisponível ou `matchMedia` ausente: renderizar em Padrão do sistema, sem lançar erro ao usuário.
- Falha de carregamento de ilustração: manter o cartão de saldo com texto e valor; ocultar a imagem quebrada sem esconder o estado financeiro.
- Dashboard carregando: não inferir reação enquanto não houver transações carregadas; exibir o estado de carregamento atual.
- Dashboard sem movimentações: renderizar o cartão com saldo de R$ 0,00 e a reação `alert`, distinguindo visualmente esse estado de uma falha de dados.

## Fora de escopo

- Novo cálculo de saldo, metas, dívidas, orçamento ou cartão de crédito.
- Alteração de tema nativo Android, splash screen, ícone do aplicativo ou configuração Tauri.
- Pesquisa, geração ou download de imagens externas.
- Personalização de cores pelo usuário além das quatro opções aprovadas.
- Alteração da semântica de gráficos, do CRUD ou da importação de extrato.

## Critérios de aceite

1. Usuário escolhe qualquer uma das quatro opções e a escolha sobrevive ao reinício do app.
2. `system` acompanha a mudança de Claro/Escuro do dispositivo; as outras escolhas não acompanham essa mudança.
3. Moranguinho aplica os tokens rosa e o padrão decorativo sem reduzir a legibilidade de conteúdo, formulários ou modais.
4. Para cada um dos seis limites de saldo, o Dashboard mostra a reação fornecida correspondente e troca corretamente nas fronteiras de R$ 0,00, R$ 50,00, R$ 150,01, R$ 300,01 e R$ 500,01.
5. Movimentações previstas não afetam a reação; realizadas afetam.
6. O seletor é acessível por mouse, toque e teclado, e o modo de movimento reduzido não anima a personagem.
7. Claro, Escuro, navegação, Dashboard, Movimentações, Categorias e o fluxo de importação CSV continuam funcionais.
