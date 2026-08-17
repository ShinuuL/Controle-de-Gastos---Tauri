import {
  ArrowLeftRight,
  LayoutDashboard,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type TabId = "dashboard" | "transactions" | "categories";

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TAB_DEFS: TabDef[] = [
  { id: "dashboard", label: "Resumo", icon: LayoutDashboard },
  { id: "transactions", label: "Movimentações", icon: ArrowLeftRight },
  { id: "categories", label: "Categorias", icon: Tags },
];
