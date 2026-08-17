import { motion } from "motion/react";
import { TAB_DEFS, type TabDef, type TabId } from "./tabs";

interface BottomNavProps {
  active: TabId;
  onSelect: (id: TabId) => void;
}

export default function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-3">
        {TAB_DEFS.map((tab) => (
          <BottomNavItem
            key={tab.id}
            tab={tab}
            active={active === tab.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  );
}

function BottomNavItem({
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
      className={`relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="bottomnav-active"
          className="absolute top-0 h-0.5 w-10 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <Icon className="size-6" aria-hidden />
      <span>{tab.label}</span>
    </button>
  );
}
