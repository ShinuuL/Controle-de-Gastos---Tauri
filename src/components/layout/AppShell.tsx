import { useState } from "react";
import { useBackGuard } from "../../lib/navigation/backGuard";
import { AppearanceSelector } from "../../features/theme/AppearanceSelector";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import type { TabId } from "./tabs";
import DashboardScreen from "../../features/dashboard/DashboardScreen";
import CategoriesScreen from "../../features/categories/CategoriesScreen";
import TransactionsScreen from "../../features/transactions/TransactionsScreen";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // Estar fora do resumo é uma camada: o voltar do Android traz de volta para
  // ele em vez de fechar o app. No resumo não há entrada empilhada, e aí voltar
  // encerra o app -- o que o Android espera da tela inicial.
  useBackGuard(activeTab !== "dashboard", () => setActiveTab("dashboard"));

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
        <AppearanceSelector compact />
      </header>
      <Sidebar active={activeTab} onSelect={setActiveTab} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{screen}</main>
      <BottomNav active={activeTab} onSelect={setActiveTab} />
    </div>
  );
}
