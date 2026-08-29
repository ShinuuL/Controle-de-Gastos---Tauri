/**
 * Conversões de cor e o ajuste que o tema moranguinho exige nas cores de
 * categoria.
 *
 * Com paleta fixa de oito cores isso não era necessário -- todas já tinham sido
 * escolhidas para funcionar. Com seletor livre, o usuário pode escolher branco
 * ou quase preto, e no moranguinho o marcador é um morango preenchido com a cor
 * sobre superfície clara e com contorno escuro: cor clara demais some no fundo,
 * cor escura demais some no contorno.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function hexToHsl(hex: string): Hsl {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: lightness * 100 };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;

  return {
    h: (hue * 60 + 360) % 360,
    s: saturation * 100,
    l: lightness * 100,
  };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = ((h % 360) + 360) % 360;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];

  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * HSV é o espaço da roda de cores: a matiz é o ângulo no anel, e saturação e
 * valor são os dois eixos do quadrado interno. HSL, usado no ajuste do
 * moranguinho, não serve aqui -- nele o branco e o preto ficam nas pontas do
 * mesmo eixo, e o quadrado precisa dos dois em cantos diferentes.
 */
export function hexToHsv(hex: string): Hsv {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);

  const hue =
    delta === 0
      ? 0
      : max === red
        ? ((green - blue) / delta) % 6
        : max === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;

  return {
    h: (hue * 60 + 360) % 360,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const value = Math.min(100, Math.max(0, v)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];

  const channel = (channelValue: number) =>
    Math.round((channelValue + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

/** Faixa de luminosidade em que o morango continua legível no tema. */
const STRAWBERRY_MIN_L = 38;
const STRAWBERRY_MAX_L = 70;

export interface BerryColors {
  fill: string;
  stroke: string;
}

/**
 * Cor de preenchimento e de contorno do morango para uma cor de categoria
 * qualquer.
 *
 * A matiz escolhida pelo usuário é preservada -- é ela que ele reconhece na
 * lista; só a luminosidade entra na faixa legível. O contorno sai da própria
 * cor, escurecido, em vez do marrom fixo de antes: com cor livre, o marrom
 * único ora sumia dentro do preenchimento, ora o engolia.
 */
export function strawberryBerryColors(color: string): BerryColors {
  if (!isHexColor(color)) return { fill: color, stroke: "#4A2634" };

  const { h, s, l } = hexToHsl(color);
  const fillLightness = Math.min(STRAWBERRY_MAX_L, Math.max(STRAWBERRY_MIN_L, l));
  return {
    fill: hslToHex({ h, s, l: fillLightness }),
    stroke: hslToHex({
      h,
      s: Math.max(s, 25),
      l: Math.max(12, fillLightness - 30),
    }),
  };
}
