import { useEffect, useId, useState } from "react";
import CategoryMarker from "./CategoryMarker";
import ColorWheel from "./ColorWheel";
import { isHexColor } from "./categoryColor";

/** Atalhos: as mesmas cores que eram a paleta fixa, agora só como sugestão. */
export const SUGGESTED_COLORS = [
  "#F59E0B",
  "#38BDF8",
  "#8B5CF6",
  "#22D3EE",
  "#D946EF",
  "#EF4444",
  "#6366F1",
  "#EC4899",
];

/**
 * Completa um hexadecimal digitado à mão.
 *
 * Aceita com ou sem `#` e nas formas de três ou seis dígitos, porque é assim
 * que a cor é copiada de outros lugares (`#fff`, `fff`, `ffffff`). Devolve
 * `null` enquanto o que foi digitado ainda não é uma cor -- o campo não pode
 * brigar com quem está no meio da digitação.
 */
export function normalizeHexInput(value: string): string | null {
  const digits = value.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{3}$/.test(digits)) {
    const [r, g, b] = digits;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9A-Fa-f]{6}$/.test(digits)) return `#${digits}`.toUpperCase();
  return null;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  strawberry: boolean;
  legend?: string;
}

/**
 * Escolha de cor da categoria: roda de cores, círculos de atalho e campo
 * hexadecimal.
 *
 * Os atalhos são redondos porque é isso que eles representam -- no tema padrão
 * o marcador da categoria é um ponto redondo, e um quadrado colorido não diz o
 * que vai aparecer na lista.
 *
 * A prévia não é enfeite: no tema moranguinho o marcador é um morango e a cor
 * passa por um ajuste de legibilidade (`strawberryBerryColors`), então a cor
 * escolhida na roda pode não ser exatamente a que a lista mostra.
 */
export default function ColorPicker({
  value,
  onChange,
  strawberry,
  legend = "Cor",
}: ColorPickerProps) {
  const hexId = useId();
  const normalized = isHexColor(value) ? value.toUpperCase() : SUGGESTED_COLORS[0];
  const [hexDraft, setHexDraft] = useState(normalized);

  // Acompanha a cor escolhida por fora do campo (círculo ou seletor do
  // sistema), sem atropelar o que está sendo digitado.
  useEffect(() => {
    setHexDraft(normalized);
  }, [normalized]);

  const commitHex = (raw: string) => {
    setHexDraft(raw);
    const parsed = normalizeHexInput(raw);
    if (parsed) onChange(parsed);
  };

  const invalidDraft = normalizeHexInput(hexDraft) === null;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_COLORS.map((swatch) => {
          const selected = normalized === swatch.toUpperCase();
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch.toUpperCase())}
              aria-label={`Selecionar cor ${swatch}`}
              aria-pressed={selected}
              className={`size-11 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                selected ? "scale-110 border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: swatch }}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
        <ColorWheel value={normalized} onChange={onChange} />

        <div className="flex w-full flex-col gap-3 sm:w-auto">
          <div>
            <label
              htmlFor={hexId}
              className="mb-1 block text-sm font-medium text-muted-foreground"
            >
              Hexadecimal
            </label>
            <input
              id={hexId}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              placeholder="#FFFFFF"
              value={hexDraft}
              onChange={(event) => commitHex(event.target.value)}
              onBlur={() => setHexDraft(normalized)}
              aria-invalid={invalidDraft}
              className={`h-11 w-32 rounded-lg border bg-background px-3 font-mono text-sm uppercase text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                invalidDraft ? "border-destructive" : "border-control-border"
              }`}
            />
          </div>

          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <CategoryMarker color={normalized} strawberry={strawberry} />
            Prévia
          </span>
        </div>
      </div>

    </fieldset>
  );
}
