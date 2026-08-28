"""Gera os SVGs do icone do Contr0l.

Conceito: a rosca do grafico de categorias -- o elemento visual mais
caracteristico do app -- desenhada como o "0" do nome Contr0l. As cores sao as
mesmas do tema escuro (src/index.css), entao o icone e o app combinam.

O desenho fica dentro de ~58% da tela para sobreviver ao recorte do icone
adaptativo do Android, cuja zona segura e o circulo central de 66%.
"""

import math
from pathlib import Path

TAM = 1024
C = TAM / 2
R_EXT = 300  # diametro 600 = 58% da tela: dentro da zona segura
R_INT = 178

FUNDO = "#0f172a"       # --background do tema escuro
AZUL = "#2563eb"        # --primary
VERDE = "#34d399"       # --success
AZUL_CLARO = "#60a5fa"  # --secondary


def ponto(raio: float, graus: float) -> tuple[float, float]:
    """Angulo em graus, 0 = topo, sentido horario."""
    rad = math.radians(graus - 90)
    return C + raio * math.cos(rad), C + raio * math.sin(rad)


def fatia(inicio: float, fim: float, cor: float) -> str:
    grande = 1 if (fim - inicio) > 180 else 0
    xo1, yo1 = ponto(R_EXT, inicio)
    xo2, yo2 = ponto(R_EXT, fim)
    xi2, yi2 = ponto(R_INT, fim)
    xi1, yi1 = ponto(R_INT, inicio)
    return (
        f'<path fill="{cor}" d="'
        f"M {xo1:.2f} {yo1:.2f} "
        f"A {R_EXT} {R_EXT} 0 {grande} 1 {xo2:.2f} {yo2:.2f} "
        f"L {xi2:.2f} {yi2:.2f} "
        f"A {R_INT} {R_INT} 0 {grande} 0 {xi1:.2f} {yi1:.2f} "
        f'Z"/>'
    )


# Proporcoes plausiveis de um mes real, com folga entre as fatias.
FATIAS = [
    (2, 208, AZUL),
    (214, 300, VERDE),
    (306, 356, AZUL_CLARO),
]


def rosca() -> str:
    return "\n  ".join(fatia(a, b, c) for a, b, c in FATIAS)


def svg(com_fundo: bool) -> str:
    fundo = f'<rect width="{TAM}" height="{TAM}" fill="{FUNDO}"/>' if com_fundo else ""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{TAM}" height="{TAM}" viewBox="0 0 {TAM} {TAM}">
  {fundo}
  {rosca()}
</svg>
"""


if __name__ == "__main__":
    destino = Path(__file__).resolve().parent.parent / "src-tauri/icons/src"
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "contr0l-icon.svg").write_text(svg(True), encoding="utf-8")
    (destino / "contr0l-icon-fg.svg").write_text(svg(False), encoding="utf-8")
    print("gerado:", destino / "contr0l-icon.svg")
    print("gerado:", destino / "contr0l-icon-fg.svg")
