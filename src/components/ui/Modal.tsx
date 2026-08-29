import { useEffect, useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBackGuard } from "../../lib/navigation/backGuard";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const titleId = useId();

  // O voltar do Android fecha o modal, como o Esc e o X fazem.
  useBackGuard(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Cabeçalho fixo com a divisória do resto do app, igual ao da
                prévia de importação: com a roda de cores dentro, o conteúdo
                rola e o título precisa continuar visível. */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-2">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Portalizado pelo mesmo motivo da prévia de importação: `.theme-shell > *`
  // dá z-index a <main>, que vira um contexto de empilhamento, e lá dentro o
  // z-50 do overlay não alcança a BottomNav -- ela passava por cima do rodapé
  // do modal. Em render de string (testes de markup) não há document.
  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
}
