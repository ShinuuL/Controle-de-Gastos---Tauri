# Design — Importação e conciliação de extrato CSV Itaú

**Data:** 2026-08-24
**Status:** Aprovado para planejamento

## Objetivo

Permitir importar extratos de conta-corrente do Itaú em CSV, inteiramente no dispositivo, conciliando as linhas com as movimentações existentes para evitar duplicidades. A integração substitui, neste escopo, qualquer dependência de Open Finance ou carteira digital.

## Escopo

- Suportar inicialmente apenas extratos de conta-corrente do Itaú em CSV.
- Ler o arquivo localmente e não enviar dados financeiros a serviços externos.
- Normalizar data, histórico, valor e indicação de crédito/débito para o formato de domínio existente.
- Exibir uma prévia de importação para revisar natureza e categoria antes da gravação.
- Criar categorias novas somente quando o CSV trouxer uma categoria explícita mantida pelo usuário e ela ainda não existir.
- Importar entradas e saídas como movimentações `realizado`.

Ficam fora do escopo: cartão de crédito, OFX, outros bancos, importação de PDF/XLS, Open Finance e categorização automática baseada apenas no histórico.

## Formato suportado

O parser aceitará as variações conhecidas do CSV de conta-corrente Itaú: delimitador `;`, datas `DD/MM/AAAA`, valores BRL com vírgula decimal e ponto de milhar, e crédito/débito indicado por `C`/`D`. O mapeamento de colunas será feito por cabeçalhos conhecidos, sem depender da posição da coluna.

O arquivo pode incluir uma coluna de categoria. Se ela estiver ausente, não haverá sugestão automática a partir do histórico: o usuário escolhe a categoria na prévia. Se existir, a categoria será sugerida; ao mantê-la, uma categoria inexistente será criada durante a confirmação.

## Conciliação

Cada lançamento ganha uma chave de comparação determinística composta por data ISO, natureza, valor em centavos e histórico normalizado (espaços repetidos, caixa e acentos não alteram a chave). O histórico original continua sendo preservado e exibido.

- **Nova:** chave inexistente no banco e no próprio arquivo.
- **Duplicata exata:** chave já presente; é ignorada por padrão.
- **Conflito possível:** mesma data, natureza e valor, com histórico semelhante mas não idêntico; nunca é unido automaticamente. A prévia apresenta a linha do arquivo e a movimentação existente para escolha explícita do usuário.

Um identificador de origem e uma restrição de unicidade no SQLite protegem contra uma confirmação repetida. As movimentações criadas manualmente continuam cobertas pela comparação determinística durante a prévia.

## Experiência de uso

Na tela Movimentações haverá uma ação **Importar extrato**. Depois da seleção do CSV, a interface mostra o resumo de novas linhas, duplicatas exatas, conflitos e linhas inválidas. Apenas linhas novas que o usuário mantiver serão confirmadas. Antes da confirmação, cada linha nova pode ter natureza e categoria ajustadas.

## Falhas e segurança

- Limitar tamanho do arquivo e quantidade de linhas.
- Aceitar UTF-8 e Windows-1252.
- Informar em pt-BR arquivos vazios, cabeçalhos desconhecidos e valores/datas inválidos, sem modificar o banco.
- Confirmar a importação em transação: qualquer falha de validação ou inserção reverte toda a confirmação.
- Usar apenas SQL parametrizado e telemetria local já existente, sem registrar conteúdo do extrato.

## Verificação

Testes unitários cobrirão o parser, normalização, codificações, linhas inválidas, duplicatas internas, duplicatas contra o banco, conflitos e sugestões/criação de categorias. Testes do repositório cobrirão a importação atômica, SQL parametrizado e a migração de esquema.
