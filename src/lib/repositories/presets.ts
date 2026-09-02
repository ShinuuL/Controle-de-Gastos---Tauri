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

/** Marca em `app_meta` de que a semeadura ja aconteceu neste banco. */
const MARCA_SEMEADURA = "categorias_semeadas";

/**
 * Cria as categorias predefinidas -- **uma vez na vida do banco**.
 *
 * A pergunta "a tabela esta vazia?" bastava enquanto ninguem conseguia apagar
 * uma predefinida. Agora que da, ela responde errado justamente para quem
 * apagou todas: no proximo boot as nove voltariam, e o app pareceria ignorar a
 * decisao da pessoa. Nenhum estado da tabela de categorias distingue "apaguei
 * tudo" de "acabei de instalar" -- categoria com lancamento nao pode ser
 * excluida, entao quem zera a lista tambem tem zero lancamentos.
 *
 * Por isso a marca explicita. Instalacao que ja existia e adotada sem semear de
 * novo: se ha categoria na tabela, a semeadura obviamente ja correu.
 */
export async function seedPresetCategories(db: Database): Promise<void> {
  const marcas = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM app_meta WHERE chave = $1",
    [MARCA_SEMEADURA],
  );
  if ((marcas[0]?.n ?? 0) > 0) return;

  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM categories",
  );
  if ((rows[0]?.n ?? 0) > 0) {
    await marcarSemeado(db);
    return;
  }

  const now = new Date().toISOString();
  for (const [index, category] of PRESET_CATEGORIES.entries()) {
    await db.execute(
      "INSERT INTO categories (id, name, icon, color, is_preset, sort_order, created_at) VALUES ($1, $2, $3, $4, 1, $5, $6)",
      [
        crypto.randomUUID(),
        category.name,
        category.icon,
        category.color,
        index,
        now,
      ],
    );
  }

  await marcarSemeado(db);
}

async function marcarSemeado(db: Database): Promise<void> {
  await db.execute(
    "INSERT OR IGNORE INTO app_meta (chave, valor) VALUES ($1, '1')",
    [MARCA_SEMEADURA],
  );
}
