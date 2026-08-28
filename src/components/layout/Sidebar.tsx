import { motion } from "motion/react";
import { AppearanceSelector } from "../../features/theme/AppearanceSelector";
import { TAB_DEFS, type TabDef, type TabId } from "./tabs";

interface SidebarProps {
  active: TabId;
  onSelect: (id: TabId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center px-6">
        <h1 className="text-lg font-semibold tracking-tight">
          Contr0l
        </h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Navegação principal">
        {TAB_DEFS.map((tab) => (
          <SidebarItem
            key={tab.id}
            tab={tab}
            active={active === tab.id}
            onSelect={onSelect}
          />
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <AppearanceSelector />
      </div>
    </aside>
  );
}

function SidebarItem({
  tab,
  active,
  onSelect,
}: {
  tab: TabDef;
  active: boolean;
  onSelect: (id: TabId) => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <Icon className="relative z-10 size-5" aria-hidden />
      <span className="relative z-10">{tab.label}</span>
    </button>
  );
}
