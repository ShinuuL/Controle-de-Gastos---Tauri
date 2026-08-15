import { useState } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import type { TabId } from "./tabs";
import DashboardScreen from "../../features/dashboard/DashboardScreen";
import ExpensesScreen from "../../features/expenses/ExpensesScreen";
import CategoriesScreen from "../../features/categories/CategoriesScreen";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const screen =
    activeTab === "dashboard" ? (
      <DashboardScreen />
    ) : activeTab === "expenses" ? (
      <ExpensesScreen />
    ) : (
      <CategoriesScreen />
    );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Sidebar active={activeTab} onSelect={setActiveTab} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{screen}</main>
      <BottomNav active={activeTab} onSelect={setActiveTab} />
    </div>
  );
}
