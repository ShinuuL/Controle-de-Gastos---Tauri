import { describe, expect, it } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import { PRESET_CATEGORIES, seedPresetCategories } from "./presets";

/**
 * Banco de mentira que responde as duas perguntas da semeadura: existe a marca
 * em `app_meta`, e quantas categorias ha.
 */
function criarDb(options: { marcado: boolean; categorias: number }) {
  const executes: Array<{ query: string; values?: unknown[] }> = [];
  let marcado = options.marcado;

  const db = {
    async select<T>(query: string): Promise<T> {
      if (query.includes("FROM app_meta")) {
        return [{ n: marcado ? 1 : 0 }] as T;
      }
      if (query.includes("FROM categories")) {
        return [{ n: options.categorias }] as T;
      }
      throw new Error(`select inesperado: ${query}`);
    },
    async execute(query: string, values?: unknown[]) {
      executes.push({ query, values });
      if (query.includes("INTO app_meta")) marcado = true;
      return { rowsAffected: 1, lastInsertId: 0 };
    },
  } as unknown as Database;

  const inserts = () => executes.filter((e) => e.query.includes("INTO categories"));
  const marcas = () => executes.filter((e) => e.query.includes("INTO app_meta"));
  return { db, inserts, marcas };
}

describe("semeadura das categorias predefinidas", () => {
  it("semeia as predefinidas num banco novo e registra a marca", async () => {
    const fake = criarDb({ marcado: false, categorias: 0 });

    await seedPresetCategories(fake.db);

    expect(fake.inserts()).toHaveLength(PRESET_CATEGORIES.length);
    expect(fake.marcas()).toHaveLength(1);
  });

  /**
   * A regressão que motivou a marca: agora que dá para apagar uma predefinida,
   * quem apagar todas fica com a lista vazia -- e "vazia" era exatamente o
   * sinal que mandava semear de novo. As nove voltariam no boot seguinte.
   */
  it("não semeia de novo depois de o usuário apagar todas", async () => {
    const fake = criarDb({ marcado: true, categorias: 0 });

    await seedPresetCategories(fake.db);

    expect(fake.inserts()).toHaveLength(0);
  });

  /**
   * Instalação que já existia antes da marca: tem categorias e nenhuma marca.
   * Adotar em vez de semear, senão ganharia nove duplicatas.
   */
  it("adota instalação anterior à marca sem semear de novo", async () => {
    const fake = criarDb({ marcado: false, categorias: 9 });

    await seedPresetCategories(fake.db);

    expect(fake.inserts()).toHaveLength(0);
    expect(fake.marcas()).toHaveLength(1);
  });

  it("não repete a semeadura quando roda duas vezes seguidas", async () => {
    const fake = criarDb({ marcado: false, categorias: 0 });

    await seedPresetCategories(fake.db);
    await seedPresetCategories(fake.db);

    expect(fake.inserts()).toHaveLength(PRESET_CATEGORIES.length);
  });
});
