# Segurança

## Modelo de ameaça local

O aplicativo é local e monousuário. Protege contra entrada inválida, corrupção por integridade referencial desativada e exposição acidental por diagnósticos. Não protege contra alguém com acesso ao perfil do sistema operacional ou ao disco desbloqueado.

## Controles atuais

- SQLite local, SQL parametrizado, chaves estrangeiras ativadas e validação no repositório.
- CSP restritiva, sem telemetria, analytics, SDK de crash, endpoint HTTP ou persistência de diagnósticos.
- Diagnósticos ficam apenas em memória, são limitados e sanitizados; não contêm dados financeiros, erros brutos ou pilhas.
- A migração de endurecimento dos centavos aborta sem alterar ou excluir dados financeiros se encontrar despesas legadas com `amount_cents` não inteiro ou não positivo. Nesse caso, restaure um backup antes de continuar. Dados legados válidos recebem as proteções de integridade para inserções e atualizações.
- O banco fica em texto simples em repouso. Use criptografia do sistema operacional e uma conta de usuário individual protegida.

## Privacidade operacional local

Não compartilhe banco, capturas, logs ou exportações. Mantenha o sistema atualizado, bloqueie a sessão e faça backup apenas em mídia/local protegido por criptografia.

## Evolução futura

Antes de sincronização remota ou suporte multiusuário, a autoridade do banco deve migrar para comandos Rust tipados. Essa mudança requer revisão de autenticação, autorização, criptografia e telemetria antes de qualquer serviço remoto.

## Checklist de release de segurança

- Executar testes, lint, build, `npm audit --omit=dev --audit-level=high`, `cargo check` e `git diff --check`.
- Confirmar CSP de produção e ausência de dependência/capacidade opener.
- Confirmar que não há segredos, telemetria remota nem diagnósticos com dados financeiros.
