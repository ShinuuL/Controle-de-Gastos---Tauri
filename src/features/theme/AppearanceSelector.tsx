import { Cherry, Moon, Palette, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "./themePreference";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "strawberry", label: "Moranguinho", Icon: Cherry },
];

interface AppearanceSelectorProps {
  compact?: boolean;
}

export function getNextMenuItemIndex(
  activeIndex: number,
  key: string,
  itemCount: number,
): number | null {
  if (itemCount === 0) return null;

  switch (key) {
    case "ArrowDown":
      return (activeIndex + 1) % itemCount;
    case "ArrowUp":
      return (activeIndex - 1 + itemCount) % itemCount;
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}

export function AppearanceSelector({ compact = false }: AppearanceSelectorProps) {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const closeMenu = useCallback((restoreTriggerFocus = false) => {
    setOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMenu, open]);

  const choose = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    closeMenu();
  };

  const menu = (
    <div
      id={menuId}
      role="menu"
      hidden={!open}
      aria-label="Escolher aparência"
      data-appearance-popover="true"
      className={`z-[60] min-w-56 rounded-lg border border-border bg-surface p-1 shadow-lg ${
        compact
          ? "fixed left-1/2 top-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
          : "absolute bottom-full mb-2"
      }`}
    >
      {OPTIONS.map(({ value, label, Icon }, index) => (
        <button
          key={value}
          ref={(node) => {
            menuItemRefs.current[index] = node;
          }}
          type="button"
          role="menuitemradio"
          aria-checked={preference === value}
          className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            preference === value
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-background"
          }`}
          onClick={() => choose(value)}
          onKeyDown={(event) => {
            const nextIndex = getNextMenuItemIndex(index, event.key, OPTIONS.length);
            if (nextIndex === null) return;

            event.preventDefault();
            menuItemRefs.current[nextIndex]?.focus();
          }}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );

  const popoverLayer = (
    <>
      {open && compact && (
        <button
          type="button"
          aria-label="Fechar seletor de aparência"
          className="fixed inset-0 z-50 cursor-default bg-black/30"
          onClick={() => closeMenu()}
        />
      )}
      {menu}
    </>
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? "Aparência" : undefined}
        className={`flex h-11 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${
          compact ? "justify-center px-3" : "w-full gap-3 px-3"
        }`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Palette className="size-5" aria-hidden />
        <span className={compact ? "sr-only" : undefined}>Aparência</span>
      </button>
      {compact && typeof document !== "undefined"
        ? createPortal(popoverLayer, document.body)
        : popoverLayer}
    </div>
  );
}
