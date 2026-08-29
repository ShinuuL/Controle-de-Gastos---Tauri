import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { hexToHsv, hsvToHex, isHexColor, type Hsv } from "./categoryColor";

/**
 * Roda de cores desenhada pelo app: anel de matiz por fora, quadrado de
 * saturação e valor por dentro.
 *
 * Existe para substituir o `<input type="color">`, que abre o seletor do
 * sistema -- uma janela do Android, com tipografia, cantos e cores que não são
 * as do app, no meio de um modal que é. Aqui tudo é CSS com os tokens do tema:
 * o anel é um `conic-gradient` e o quadrado são duas camadas sobre a matiz
 * escolhida, sem canvas e sem imagem.
 */

const RING_THICKNESS = 28;

/** Matiz a partir do ponto tocado, com 0° no topo e crescendo no sentido horário. */
export function hueFromPoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
): number {
  const angle = Math.atan2(point.x - center.x, center.y - point.y);
  return ((angle * 180) / Math.PI + 360) % 360;
}

/** Posição do marcador do anel, em fração da caixa (0 a 1). */
export function pointFromHue(hue: number): { x: number; y: number } {
  const radians = (hue * Math.PI) / 180;
  return {
    x: 0.5 + Math.sin(radians) * 0.5,
    y: 0.5 - Math.cos(radians) * 0.5,
  };
}

/** Saturação e valor a partir do ponto tocado dentro do quadrado. */
export function svFromPoint(
  point: { x: number; y: number },
  size: { width: number; height: number },
): { s: number; v: number } {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    s: clamp(point.x / size.width) * 100,
    v: (1 - clamp(point.y / size.height)) * 100,
  };
}

interface ColorWheelProps {
  value: string;
  onChange: (color: string) => void;
  /** Lado da roda em pixels; o quadrado interno é derivado dele. */
  size?: number;
}

export default function ColorWheel({
  value,
  onChange,
  size = 208,
}: ColorWheelProps) {
  const ringRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  const hsv: Hsv = hexToHsv(isHexColor(value) ? value : "#F59E0B");
  const hueColor = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const ringMarker = pointFromHue(hsv.h);
  // O quadrado é o maior que cabe dentro do anel: lado = diâmetro interno / raiz de 2.
  const squareSize =
    Math.round(((size - RING_THICKNESS * 2) / Math.SQRT2) * 10) / 10;

  const dragHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = ringRef.current?.getBoundingClientRect();
    if (!box) return;
    const hue = hueFromPoint(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      { x: box.width / 2, y: box.height / 2 },
    );
    onChange(hsvToHex({ ...hsv, h: hue }));
  };

  const dragSaturationValue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = squareRef.current?.getBoundingClientRect();
    if (!box) return;
    const { s, v } = svFromPoint(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      { width: box.width, height: box.height },
    );
    onChange(hsvToHex({ h: hsv.h, s, v }));
  };

  /**
   * Só arrasta com o dedo (ou botão) pressionado. A captura do ponteiro mantém
   * os eventos vindo mesmo quando o dedo sai da roda, senão o arrasto morre na
   * borda -- justamente onde fica a cor que se está tentando escolher.
   */
  const dragging =
    (handler: (event: ReactPointerEvent<HTMLDivElement>) => void) =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.type === "pointerdown") {
        event.currentTarget.setPointerCapture(event.pointerId);
        handler(event);
        return;
      }
      if (event.buttons !== 0) handler(event);
    };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        ref={ringRef}
        role="slider"
        tabIndex={0}
        aria-label="Matiz"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={`${Math.round(hsv.h)} graus`}
        onPointerDown={dragging(dragHue)}
        onPointerMove={dragging(dragHue)}
        onKeyDown={(event) => {
          const amount = event.shiftKey ? 10 : 1;
          const hue =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? (hsv.h + amount) % 360
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? (hsv.h - amount + 360) % 360
                : null;
          if (hue === null) return;
          event.preventDefault();
          onChange(hsvToHex({ ...hsv, h: hue }));
        }}
        className="absolute inset-0 cursor-pointer touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{
          background:
            "conic-gradient(#FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)",
          // O buraco do anel é máscara, e não um círculo da cor do fundo por
          // cima: assim o centro fica realmente vazado e a roda não precisa
          // saber em que superfície o modal a colocou.
          mask: `radial-gradient(circle at center, transparent calc(50% - ${RING_THICKNESS}px), #000 calc(50% - ${RING_THICKNESS}px))`,
          WebkitMask: `radial-gradient(circle at center, transparent calc(50% - ${RING_THICKNESS}px), #000 calc(50% - ${RING_THICKNESS}px))`,
        }}
      />

      <span
        aria-hidden
        className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/30"
        style={{
          left: `${ringMarker.x * 100}%`,
          top: `${ringMarker.y * 100}%`,
          backgroundColor: hueColor,
        }}
      />

      <div
        ref={squareRef}
        role="slider"
        tabIndex={0}
        aria-label="Saturação e brilho"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={`saturação ${Math.round(hsv.s)}%, brilho ${Math.round(hsv.v)}%`}
        onPointerDown={dragging(dragSaturationValue)}
        onPointerMove={dragging(dragSaturationValue)}
        onKeyDown={(event) => {
          const amount = event.shiftKey ? 10 : 1;
          const next =
            event.key === "ArrowRight"
              ? { ...hsv, s: Math.min(100, hsv.s + amount) }
              : event.key === "ArrowLeft"
                ? { ...hsv, s: Math.max(0, hsv.s - amount) }
                : event.key === "ArrowUp"
                  ? { ...hsv, v: Math.min(100, hsv.v + amount) }
                  : event.key === "ArrowDown"
                    ? { ...hsv, v: Math.max(0, hsv.v - amount) }
                    : null;
          if (!next) return;
          event.preventDefault();
          onChange(hsvToHex(next));
        }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{
          width: squareSize,
          height: squareSize,
          backgroundColor: hueColor,
          backgroundImage:
            "linear-gradient(to top, #000000, rgba(0,0,0,0)), linear-gradient(to right, #FFFFFF, rgba(255,255,255,0))",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/30"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            backgroundColor: isHexColor(value) ? value : "#F59E0B",
          }}
        />
      </div>
    </div>
  );
}
