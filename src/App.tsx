import { useEffect, useState } from "react";
import AppShell from "./components/layout/AppShell";
import { ThemeProvider } from "./features/theme/ThemeProvider";
import DatabaseRecoveryScreen from "./features/recovery/DatabaseRecoveryScreen";
import { getDb } from "./lib/db";
import { classifyDbFailure, type DbFailure } from "./lib/dbFailure";

type Boot =
  | { kind: "verificando" }
  | { kind: "pronto" }
  | { kind: "falhou"; falha: DbFailure };

/**
 * Portao de inicializacao: abre o banco uma vez antes de montar o app.
 *
 * A migracao roda dentro de `Database.load()`. Se ela falhar -- caso da
 * populacao que instalou um build com a migracao v1 editada -- o erro chega
 * aqui e vira tela de reparo, em vez de cada tela quebrar por conta propria.
 */
function App() {
  const [boot, setBoot] = useState<Boot>({ kind: "verificando" });

  useEffect(() => {
    let cancelado = false;
    getDb()
      .then(() => {
        if (!cancelado) setBoot({ kind: "pronto" });
      })
      .catch((erro: unknown) => {
        if (!cancelado) setBoot({ kind: "falhou", falha: classifyDbFailure(erro) });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <ThemeProvider>
      {boot.kind === "falhou" ? (
        <DatabaseRecoveryScreen falha={boot.falha} />
      ) : boot.kind === "verificando" ? (
        <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          <span aria-busy="true">Carregando…</span>
        </div>
      ) : (
        <AppShell />
      )}
    </ThemeProvider>
  );
}

export default App;
