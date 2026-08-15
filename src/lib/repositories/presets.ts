import type Database from "@tauri-apps/plugin-sql";

export const PRESET_CATEGORIES = [
  { name: "Alimentação", icon: "utensils-crossed", color: "#F59E0B" },
  { name: "Transporte", icon: "car", color: "#38BDF8" },
  { name: "Moradia", icon: "home", color: "#8B5CF6" },
  { name: "Contas & Utilidades", icon: "receipt", color: "#22D3EE" },
  { name: "Lazer", icon: "gamepad-2", color: "#D946EF" },
  { name: "Saúde", icon: "heart-pulse", color: "#EF4444" },
  { name: "Educação", icon: "graduation-cap", color: "#6366F1" },
  { name: "Compras", icon: "shopping-bag", color: "#EC4899" },
  { name: "Outros", icon: "circle-dashed", color: "#94A3B8" },
];

export async function seedPresetCategories(db: Database): Promise<void> {
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM categories",
  );
  if ((rows[0]?.n ?? 0) > 0) return;

  const now = new Date().toISOString();
  for (const [index, category] of PRESET_CATEGORIES.entries()) {
    await db.execute(
      "INSERT INTO categories (id, name, icon, color, is_preset, sort_order, created_at) VALUES ($1, $2, $3, $4, 1, $5, $6)",
      [crypto.randomUUID(), category.name, category.icon, category.color, index, now],
    );
  }
}
