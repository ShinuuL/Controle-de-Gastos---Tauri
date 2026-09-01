## Contr0l 0.5.1

Correção da importação de extrato, exclusão de conta pelo app, e o app passa a
avisar quando existe versão nova.

### Importação de extrato voltou a funcionar

Importar o CSV do Nubank falhava no celular com "não foi possível comparar o
extrato com as movimentações", mesmo com o arquivo perfeitamente legível. O
problema não era a leitura do extrato: era a checagem de duplicatas, que fazia
uma consulta ao banco **por linha** do arquivo — dezenas de idas e voltas, e
bastava uma falhar para a prévia inteira morrer.

Agora é uma consulta só, para o extrato inteiro. A checagem continua a mesma:
lançamento que você já digitou à mão é apontado antes de gravar, mesmo escrito
com outras palavras.

E quando algo der errado de novo, o app diz **o que** deu errado. A mensagem
genérica escondia a causa, e no celular não há console para conferir.

### Apagar a conta, pelo próprio app

Em **Sua conta → Apagar minha conta**. Apaga do servidor a conta, o e-mail e o
backup cifrado, e não tem volta.

**Seus lançamentos continuam no aparelho.** Eles nunca foram do servidor — o app
volta a funcionar sem conta, como antes de você criar uma.

A página de download agora tem [política de privacidade](https://contr0l.pages.dev/privacidade.html)
e [termos de uso](https://contr0l.pages.dev/termos.html), com o que existe do
meu lado, por quanto tempo, e o que dele eu consigo ler — que é: nada dos seus
lançamentos.

### O app avisa quando há versão nova

Uma vez por dia, no máximo, o Contr0l pergunta ao servidor se existe versão mais
recente. Se existir, aparece uma faixa com o tamanho do arquivo antes de baixar
qualquer coisa — se estiver no dado móvel, você decide.

**Nada é instalado sozinho.** O app verifica a assinatura da versão, confere o
arquivo baixado byte a byte e abre o instalador do Android; a confirmação é sua,
numa tela do sistema. Na primeira vez, o Android vai pedir autorização para o
Contr0l abrir um instalador — é uma tela do próprio sistema, e o app explica
antes de você chegar nela.

Se o arquivo baixado não conferir com a assinatura, ele é apagado e nada é
instalado.

### Tema moranguinho

O fundo no celular voltou a ser a arte original. A versão vetorial da 0.5.0
resolveu a pixelização em tela grande, mas mudava o desenho em tela estreita —
agora cada tamanho de tela usa a versão certa.

### Observações

- Quem não criar conta não é afetado por nada da parte de nuvem.
- Esta versão é a primeira que sabe se atualizar. A faixa de atualização só vai
  aparecer da próxima versão em diante.
