import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useBackGuard } from "../../lib/navigation/backGuard";
import { AppearanceSelector } from "../../features/theme/AppearanceSelector";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import type { TabId } from "./tabs";
import DashboardScreen from "../../features/dashboard/DashboardScreen";
import CategoriesScreen from "../../features/categories/CategoriesScreen";
import TransactionsScreen from "../../features/transactions/TransactionsScreen";
import AccountModal from "../../features/auth/AccountModal";
import { sessaoAtual, type Sessao } from "../../features/auth/authClient";
import { useBackupAutomatico } from "../../lib/cloud/useBackupAutomatico";
import UpdateBanner from "../../features/update/UpdateBanner";
import {
  verificarAtualizacao,
  type EstadoAtualizacao,
} from "../../features/update/updateClient";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [contaAberta, setContaAberta] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  // Resultado da checagem que o usuário pede na janela da conta. Mora aqui
  // porque quem pergunta (a janela) e quem mostra a oferta (a faixa) são
  // vizinhos, não parentes -- e a rede só precisa ser consultada uma vez.
  const [checagemManual, setChecagemManual] = useState<EstadoAtualizacao | null>(null);

  // A sessao sobrevive ao fechamento do app (session_store.rs), entao isto
  // devolve quem ja estava conectado.
  useEffect(() => {
    let cancelado = false;
    sessaoAtual()
      .then((s) => {
        if (!cancelado) setSessao(s);
      })
      .catch(() => {
        // Sessao indisponivel nao pode derrubar o app: ele e local-first.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Estar fora do resumo é uma camada: o voltar do Android traz de volta para
  // ele em vez de fechar o app. No resumo não há entrada empilhada, e aí voltar
  // encerra o app -- o que o Android espera da tela inicial.
  useBackGuard(activeTab !== "dashboard", () => setActiveTab("dashboard"));

  useBackupAutomatico(sessao !== null);

  async function verificarAgora(): Promise<EstadoAtualizacao> {
    const novo = await verificarAtualizacao(true);
    setChecagemManual(novo);
    return novo;
  }

  const screen =
    activeTab === "dashboard" ? (
      <DashboardScreen />
    ) : activeTab === "transactions" ? (
      <TransactionsScreen />
    ) : (
      <CategoriesScreen />
    );

  return (
    <div className="theme-shell flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <h1 className="wordmark text-base">Contr0l</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setContaAberta(true)}
            aria-label={sessao ? `Conta: ${sessao.email}` : "Conta"}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <UserRound className="size-5" aria-hidden />
          </button>
          <AppearanceSelector compact />
        </div>
      </header>
      <Sidebar
        active={activeTab}
        onSelect={setActiveTab}
        conta={sessao ? sessao.email : "Conta"}
        onConta={() => setContaAberta(true)}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        {/* Acima do conteudo e abaixo da navegacao: e um aviso, nao uma tela.
            Some sozinho quando nao ha versao nova. */}
        <UpdateBanner estadoExterno={checagemManual} />
        {screen}
      </main>
      <BottomNav active={activeTab} onSelect={setActiveTab} />
      <AccountModal
        open={contaAberta}
        onClose={() => setContaAberta(false)}
        sessao={sessao}
        onSessao={setSessao}
        onVerificarAtualizacao={verificarAgora}
      />
    </div>
  );
}
