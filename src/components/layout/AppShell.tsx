import { useState } from "react";
import { AppearanceSelector } from "../../features/theme/AppearanceSelector";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import type { TabId } from "./tabs";
import DashboardScreen from "../../features/dashboard/DashboardScreen";
import CategoriesScreen from "../../features/categories/CategoriesScreen";
import TransactionsScreen from "../../features/transactions/TransactionsScreen";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

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
        <h1 className="text-base font-semibold tracking-tight">Contr0l</h1>
        <AppearanceSelector compact />
      </header>
      <Sidebar active={activeTab} onSelect={setActiveTab} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{screen}</main>
      <BottomNav active={activeTab} onSelect={setActiveTab} />
    </div>
  );
}
