import { LayoutDashboard, Receipt, Tags, type LucideIcon } from "lucide-react";

export type TabId = "dashboard" | "expenses" | "categories";

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TAB_DEFS: TabDef[] = [
  { id: "dashboard", label: "Resumo", icon: LayoutDashboard },
  { id: "expenses", label: "Despesas", icon: Receipt },
  { id: "categories", label: "Categorias", icon: Tags },
];
