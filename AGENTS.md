# Política de desenvolvimento

## Autorização

Agentes não podem criar, editar ou excluir código, configuração, dependências, migrações ou documentação sem aprovação direta do desenvolvedor para o escopo e a fase exatos. Inspeção e verificação somente leitura são permitidas. Esta solicitação direta de endurecimento está autorizada para este escopo.

## Regras de negócio

- Interface e valores usam pt-BR e BRL; valores monetários são inteiros em centavos.
- Datas são ISO `YYYY-MM-DD`, sem horário.
- SQLite é local agora; uma futura nuvem deve usar comandos Rust tipados como autoridade do banco.
- IDs usam UUID. Despesa exige valor positivo, categoria existente e data válida.
- Categorias predefinidas são protegidas. Categoria personalizada com despesas não pode ser excluída.
- Orçamento mensal de categoria é `null` ou centavos positivos. Não há parcelas ou recorrência.
- O dashboard agrupa fatias de forma acessível e fornece alternativa acessível quando necessário.

## Segurança e observabilidade

- Use apenas SQL parametrizado. Não registre segredos ou dados financeiros pessoais.
- Use o repositório e não adicione telemetria remota sem aprovação explícita e comandos de verificação exatos.
