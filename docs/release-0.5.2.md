## Contr0l 0.5.2

Correção de um defeito no banco local que quebrava a importação de extrato em
alguns aparelhos.

### Importar extrato falhava com um erro de banco

Em alguns celulares, importar um extrato parava em:

> Não foi possível comparar o extrato com as movimentações: error returned from
> database: (code: 1) no such column: e.import_fingerprint

O arquivo estava perfeito — o problema era o banco do próprio aparelho. Uma
coluna que o app usa para reconhecer lançamentos já importados nunca chegou a
ser criada ali, embora o histórico interno de atualizações jurasse que sim.

A causa foi o reparo automático da 0.4.x. Ele consertava aparelhos cujo
histórico tinha divergido, mas dava por aplicada **toda** atualização pendente,
não só as que ele conseguia comprovar. No aparelho onde essa coluna ainda
estava por criar, ela foi marcada como pronta sem nunca ter sido feita — e a
partir dali nada mais a criaria.

A 0.5.0 já impediu que isso acontecesse de novo, mas quem tinha sido atingido
continuava atingido. **Esta versão cura o aparelho.** Ao abrir o app, ele
confere se cada atualização do banco realmente aconteceu e refaz o que estiver
faltando, com uma cópia de segurança antes.

Você não precisa fazer nada, e nenhum lançamento é alterado — o reparo só
acrescenta o que faltava. Depois disso, importar extrato volta a funcionar
normalmente.

### Observações

- Quem nunca viu esse erro não é afetado: o app confere, não encontra nada
  faltando e segue direto.
- O erro dependia do aparelho, não do extrato. O mesmo arquivo que falhava num
  celular funcionava em outro.
