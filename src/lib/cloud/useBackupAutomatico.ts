import { useEffect } from "react";
import { backupAutomatico } from "./sync";

/**
 * Dispara o backup automatico na abertura do app e sempre que ele sai de vista.
 *
 * `visibilitychange` e o gatilho certo no Android: quando o usuario volta para
 * a tela inicial ou troca de app, a webview fica `hidden` -- e esse e o momento
 * mais proximo de "fechou o app" que existe la. O evento de fechar janela do
 * desktop foi deixado de fora de proposito: segurar o fechamento esperando uma
 * requisicao de rede terminar deixa o app parecendo travado, e a abertura
 * seguinte cobre o mesmo caso.
 *
 * A janela minima entre envios mora no Rust, entao chamar demais aqui e barato:
 * o comando responde "cedo" e nao toca a rede.
 */
export function useBackupAutomatico(temSessao: boolean) {
  useEffect(() => {
    if (!temSessao) return;

    // Erros sao engolidos de proposito: ver a nota em backupAutomatico().
    const tentar = () => void backupAutomatico().catch(() => {});

    tentar();
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === "hidden") tentar();
    };
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    return () => document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
  }, [temSessao]);
}
