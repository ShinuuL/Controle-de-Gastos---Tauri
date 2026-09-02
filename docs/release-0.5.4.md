## Contr0l 0.5.4

Correção urgente: a 0.5.3 impedia alguns aparelhos de abrir o app. **Se o seu
Contr0l parou de abrir depois da 0.5.3, é esta versão que resolve.**

### O app voltava com "Não foi possível abrir seus dados"

Em aparelhos cujo histórico interno de atualizações do banco estava
inconsistente, a 0.5.3 não abria. A tela dizia que a causa era desconhecida e
pedia para acionar o suporte — sem oferecer o botão de reparo, que era
justamente o que resolveria.

Esses aparelhos já estavam com o problema antes, só que calado. Quando a
abertura do banco falhava, o app tentava de novo por conta própria; a segunda
tentativa abria o banco **sem aplicar as atualizações pendentes** e parecia dar
certo. O app subia normalmente, e a falha só aparecia muito depois, ao usar
algo que dependia de uma atualização que nunca rodou — como importar um extrato.

Agora o app não tenta de novo em silêncio. Ele mostra a causa real logo na
primeira falha e oferece **Reparar meus dados**, que acerta o histórico e aplica
o que faltava. Seus lançamentos não são alterados, e uma cópia de segurança é
feita antes.

### Sobre a 0.5.2: a explicação que demos estava errada

As notas da 0.5.2 diziam que a coluna faltante vinha de uma atualização marcada
como aplicada sem ter rodado, e que o app se curaria sozinho ao abrir.

A causa real era outra: **nenhuma** atualização rodava naquele aparelho, porque
o histórico divergente fazia o app abortar a aplicação inteira — e a repetição
silenciosa descrita acima escondia isso. A cura automática da 0.5.2 trata um
caso diferente e, por isso, não resolvia esse.

Quem estava nessa situação continua precisando de um toque em **Reparar meus
dados**, e é esta versão que oferece esse botão.

### Observações

- Quem nunca viu erro ao abrir o app não é afetado: nada muda.
- As mudanças da 0.5.3 continuam valendo — excluir categorias padrão e verificar
  atualização na hora.
