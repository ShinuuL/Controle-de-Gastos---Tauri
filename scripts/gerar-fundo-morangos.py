"""
Gera `src/assets/moranguinho/fundo-morangos.svg`, o fundo do tema moranguinho.

    python scripts/gerar-fundo-morangos.py

Por que gerado e nao desenhado a mao: as posicoes sao sorteadas com distancia
minima num espaco TOROIDAL, ou seja, a distancia considera a volta pelas bordas.
E isso que faz o ladrilho encaixar consigo mesmo sem colar duas frutas na
emenda, e ao mesmo tempo tira o aspecto de grade. Fileiras fixas foram tentadas
antes e o olho enxergava as colunas: a estampa virava papel quadriculado.

A semente e fixa. O arquivo precisa sair identico a cada rodada, senao todo
`git diff` viraria ruido.

Escala e paleta foram MEDIDAS no `Fundo-Mobile.jpeg` original (morango de 31x34,
um a cada ~6.400 px2 de fundo) e conferidas contando as frutas do resultado.
Mexer em LADO, N_FRUTAS ou no tamanho do morango muda a densidade -- vale medir
de novo antes de aceitar.
"""

import pathlib
import random

LADO = 224
N_FRUTAS = 8
N_BOLINHAS = 26
DIST_FRUTA = 62  # entre centros de frutas
DIST_BOLINHA = 26  # entre bolinha e qualquer fruta ou bolinha
RAIO_BOLINHA = 4
SEMENTE = 20260830

DESTINO = (
    pathlib.Path(__file__).resolve().parent.parent
    / "src"
    / "assets"
    / "moranguinho"
    / "fundo-morangos.svg"
)


def dist_toro(a, b):
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    return (min(dx, LADO - dx) ** 2 + min(dy, LADO - dy) ** 2) ** 0.5


def espalhar(rng, quantos, minima, existentes):
    """Amostragem por rejeicao: sorteia e descarta o que ficar perto demais."""
    postos = []
    tentativas = 0
    while len(postos) < quantos and tentativas < 20000:
        tentativas += 1
        p = (rng.uniform(0, LADO), rng.uniform(0, LADO))
        if all(dist_toro(p, q) >= minima for q in postos + existentes):
            postos.append(p)
    if len(postos) < quantos:
        raise SystemExit(
            f"so coube {len(postos)} de {quantos} com distancia {minima}; "
            "afrouxe a distancia ou aumente LADO"
        )
    return postos


def repeticoes(x, y, margem):
    """A propria posicao mais as copias que a emenda exige.

    Uma fruta perto da borda precisa aparecer tambem do outro lado, senao o
    ladrilho a corta ao meio quando se repete.
    """
    saida = []
    for dx in (-LADO, 0, LADO):
        for dy in (-LADO, 0, LADO):
            nx, ny = x + dx, y + dy
            if -margem <= nx <= LADO + margem and -margem <= ny <= LADO + margem:
                saida.append((nx, ny))
    return saida


CABECALHO = """<!--
  Fundo do tema moranguinho, em vetor.

  Substitui os dois bitmaps que existiam antes (`strawberry-background.avif`,
  740x493, e `Fundo-Mobile.jpeg`, 675x1200). A arte original ja era um padrao
  que se repete: morangos e bolinhas sobre rosa. Padrao nao precisa de bitmap,
  precisa de um ladrilho — e em vetor ele fica nitido em qualquer tamanho de
  janela e em qualquer densidade de tela. Era isso que faltava no desktop, onde
  o AVIF de 740px era ampliado cerca de 2,6x para preencher a tela.

  Paleta e escala MEDIDAS no JPEG original, para o tema nao mudar de cara:
    fundo #ffd9e8 · morango #f78ba6 · folha #a0d28c · bolinha #ffffff
    morango de 31x34, um a cada ~6.400 px2 de fundo

  O CSS aplica com `background-size: 224px`, o tamanho do proprio ladrilho: a
  estampa mantem a escala medida na arte original em vez de crescer com a
  janela. O morango e mais alto que largo (34 contra 31) — errar isso o deixa
  com cara de tomate.

  ARQUIVO GERADO por `scripts/gerar-fundo-morangos.py`. Nao edite aqui: rode o
  script. Ele explica por que as posicoes sao sorteadas em vez de fixas.

  Cuidado: comentario XML nao aceita dois hifens seguidos, e o SVG deixa de
  carregar inteiro se isso escapar.
-->
<svg xmlns="http://www.w3.org/2000/svg" width="{lado}" height="{lado}" viewBox="0 0 {lado} {lado}">
  <defs>
    <!-- Um morango so, reaproveitado com rotacoes e posicoes diferentes.
         Desenhado em torno da origem, com 31 de largura por 34 de altura. -->
    <g id="m">
      <!-- Ombros largos perto do topo, afinando ate a ponta arredondada. -->
      <path d="M0 19c-5.4-3-13.4-11.4-15.4-22.6C-17.6-9.8-12-15.4 0-15.4s17.6 5.6 15.4 11.8C13.4 7.6 5.4 16 0 19Z" fill="#f78ba6"/>
      <!-- Coroa centrada no eixo da fruta. -->
      <g transform="translate(4.6 .6) scale(.82)">
        <path d="M0-17.4c-5.6-7.4-12.4-6.8-15.4-5.2 3.7 1.4 6.6 4.4 8 8.2-4.3-2.2-8.8-1.4-11.7.8 5.1.8 9.6 3.8 12.5 7.4C-4.5-9.8-.2-12.8 4.9-13.6 2-15.8-2.5-16.6-6.8-14.4c1.4-3.8 4.3-6.8 8-8.2C-1.8-24.2-8.6-24.8-14.2-17.4Z" fill="#a0d28c"/>
      </g>
      <g fill="#fff" opacity=".8">
        <ellipse cx="-5.4" cy="-3.4" rx="1.2" ry="1.9" transform="rotate(-26 -5.4 -3.4)"/>
        <ellipse cx="2.6" cy="-5.6" rx="1.2" ry="1.9" transform="rotate(8 2.6 -5.6)"/>
        <ellipse cx="6.2" cy="2.2" rx="1.2" ry="1.9" transform="rotate(30 6.2 2.2)"/>
        <ellipse cx="-2.8" cy="6.8" rx="1.2" ry="1.9" transform="rotate(-15 -2.8 6.8)"/>
        <ellipse cx="4" cy="11" rx="1.2" ry="1.9" transform="rotate(20 4 11)"/>
      </g>
    </g>
  </defs>

  <rect width="{lado}" height="{lado}" fill="#ffd9e8"/>

{frutas}

  <!-- Bolinhas nos vaos. Depois dos morangos para nunca sumirem sob eles. -->
  <g fill="#ffffff">
{bolinhas}
  </g>
</svg>
"""


def main():
    rng = random.Random(SEMENTE)
    frutas = espalhar(rng, N_FRUTAS, DIST_FRUTA, [])
    bolinhas = espalhar(rng, N_BOLINHAS, DIST_BOLINHA, frutas)

    usos = []
    for x, y in frutas:
        giro = rng.uniform(-16, 16)
        for px, py in repeticoes(x, y, 24):
            usos.append(
                f'  <use href="#m" transform="translate({px:.1f} {py:.1f}) rotate({giro:.1f})"/>'
            )

    pontos = []
    for x, y in bolinhas:
        for px, py in repeticoes(x, y, RAIO_BOLINHA + 1):
            pontos.append(f'    <circle cx="{px:.1f}" cy="{py:.1f}" r="{RAIO_BOLINHA}"/>')

    svg = CABECALHO.format(lado=LADO, frutas="\n".join(usos), bolinhas="\n".join(pontos))
    DESTINO.write_text(svg, encoding="utf-8")
    print(f"{DESTINO}\n  {len(frutas)} morangos, {len(bolinhas)} bolinhas, ladrilho {LADO}x{LADO}")
    print(f"  {DESTINO.stat().st_size} bytes")


if __name__ == "__main__":
    main()
