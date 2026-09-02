import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, LifeBuoy } from "lucide-react";
import type { DbFailure } from "../../lib/dbFailure";
import { isRepairable } from "../../lib/dbFailure";

interface RepairOutcome {
  backup: string;
  corrigidas: number[];
  carimbadas: number[];
  reaplicadas: number[];
}

type Estado =
  | { kind: "inicial" }
  | { kind: "reparando" }
  | { kind: "reparado"; outcome: RepairOutcome }
  | { kind: "falhou"; message: string };

export default function DatabaseRecoveryScreen({ falha }: { falha: DbFailure }) {
  const [estado, setEstado] = useState<Estado>({ kind: "inicial" });
  const reparavel = isRepairable(falha);

  async function reparar() {
    setEstado({ kind: "reparando" });
    try {
      const outcome = await invoke<RepairOutcome>("repair_database");
      setEstado({ kind: "reparado", outcome });
    } catch (erro: unknown) {
      setEstado({
        kind: "falhou",
        message: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-6 shrink-0 text-warning" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">
          Não foi possível abrir seus dados
        </h1>
      </div>

      {reparavel ? (
        <p className="text-sm text-muted-foreground">
          O histórico interno de atualizações do banco está inconsistente com
          esta versão do app. Seus lançamentos continuam gravados no aparelho —
          o reparo apenas acerta esse histórico e{" "}
          <strong className="font-medium text-foreground">
            não apaga nem altera nenhum dado
          </strong>
          . Uma cópia de segurança é criada antes.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          O banco local não abriu, e a causa não é uma que o reparo automático
          saiba tratar. Não altere nada e envie a mensagem abaixo para o
          suporte.
        </p>
      )}

      {estado.kind === "reparado" ? (
        <div
          role="status"
          className="rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm"
        >
          <p className="font-medium">Reparo concluído.</p>
          <p className="mt-1 text-muted-foreground">
            Cópia de segurança em <code className="break-all">{estado.outcome.backup}</code>.
          </p>
          <p className="mt-3 font-medium text-foreground">
            Feche e abra o aplicativo para concluir.
          </p>
          <p className="mt-1 text-muted-foreground">
            As migrações só rodam uma vez por execução, então elas precisam de
            uma inicialização nova para serem aplicadas.
          </p>
        </div>
      ) : null}

      {estado.kind === "falhou" ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {estado.message}
        </p>
      ) : null}

      {reparavel && estado.kind !== "reparado" ? (
        <button
          type="button"
          onClick={reparar}
          disabled={estado.kind === "reparando"}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
        >
          <LifeBuoy className="size-4" aria-hidden />
          {estado.kind === "reparando" ? "Reparando…" : "Reparar meus dados"}
        </button>
      ) : null}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Detalhes técnicos</summary>
        <p className="mt-2 break-all font-mono">{falha.raw}</p>
      </details>
    </main>
  );
}
