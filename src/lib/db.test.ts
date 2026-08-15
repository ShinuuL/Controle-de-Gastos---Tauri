import { describe, expect, it } from "vitest";
import type { QueryResult } from "@tauri-apps/plugin-sql";
import { createDbGetter } from "./db";

interface FakeDatabase {
  execute: (statement: string) => Promise<QueryResult>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("createDbGetter", () => {
  it("shares one complete initialization among concurrent callers", async () => {
    const loaded = createDeferred<FakeDatabase>();
    const calls = { load: 0, pragma: 0, seed: 0 };
    const database: FakeDatabase = {
      execute: async (statement) => {
        expect(statement).toBe("PRAGMA foreign_keys = ON");
        calls.pragma += 1;
        return { rowsAffected: 0 };
      },
    };
    const getDb = createDbGetter({
      load: async () => {
        calls.load += 1;
        return loaded.promise;
      },
      seed: async (db) => {
        expect(db).toBe(database);
        calls.seed += 1;
      },
    });

    const first = getDb();
    const second = getDb();
    const third = getDb();
    expect(calls.load).toBe(1);

    loaded.resolve(database);
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      database,
      database,
      database,
    ]);
    expect(calls).toEqual({ load: 1, pragma: 1, seed: 1 });
  });

  it("clears a failed initialization so the next caller can retry", async () => {
    const database: FakeDatabase = {
      execute: async () => ({ rowsAffected: 0 }),
    };
    let attempts = 0;
    const getDb = createDbGetter({
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("load failed");
        return database;
      },
      seed: async () => undefined,
    });

    await expect(getDb()).rejects.toThrow("load failed");
    await expect(getDb()).resolves.toBe(database);
    expect(attempts).toBe(2);
  });
});
