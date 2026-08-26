import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TransactionWithCategory } from "../../lib/types";

const dashboardState = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  resolvedTheme: "light" as "light" | "strawberry",
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => undefined,
    useState: <T,>(initialValue: T) => {
      const value = dashboardState.values[dashboardState.index++];
      return [value === undefined ? initialValue : (value as T), () => undefined];
    },
  };
});

vi.mock("../../lib/repositories/transactions", () => ({
  monthlyTotalsByCategory: vi.fn(),
  listTransactionsByMonth: vi.fn(),
}));

vi.mock("../theme/ThemeProvider", () => ({
  useTheme: () => ({ resolvedTheme: dashboardState.resolvedTheme }),
}));

import DashboardScreen from "./DashboardScreen";

const transactions: TransactionWithCategory[] = [
  {
    id: "realized-expense",
    category_id: "food",
    category_name: "Alimentação",
    category_color: "#ef4444",
    description: "Mercado",
    amount_cents: 10_000,
    date: "2026-08-01",
    nature: "saida",
    status: "realizado",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "projected-income",
    category_id: "salary",
    category_name: "Salário",
    category_color: "#22c55e",
    description: "Pagamento previsto",
    amount_cents: 100_000,
    date: "2026-08-02",
    nature: "entrada",
    status: "previsto",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

function renderDashboard(
  resolvedTheme: "light" | "strawberry",
  monthTransactions = transactions,
) {
  dashboardState.resolvedTheme = resolvedTheme;
  dashboardState.values = [2026, 8, monthTransactions, [], null, false];
  dashboardState.index = 0;

  return renderToStaticMarkup(<DashboardScreen />);
}

function balanceMoodCard(markup: string): string | undefined {
  return markup.match(
    /<section(?=[^>]*aria-labelledby="balance-mood-title")[^>]*>.*?<\/section>/,
  )?.[0];
}

describe("DashboardScreen", () => {
  beforeEach(() => {
    dashboardState.resolvedTheme = "light";
  });

  test("mostra o cartão somente no tema Moranguinho", () => {
    expect(balanceMoodCard(renderDashboard("light"))).toBeUndefined();
    expect(balanceMoodCard(renderDashboard("strawberry"))).toBeDefined();
  });

  test("fornece ao cartão o saldo realizado, não a projeção", () => {
    const card = balanceMoodCard(renderDashboard("strawberry"));

    expect(card).toContain("−R$\u00a0100,00");
    expect(card).not.toContain("+R$\u00a0900,00");
  });

  test("mantém o cartão de reação alert no estado vazio do Moranguinho", () => {
    const card = balanceMoodCard(renderDashboard("strawberry", []));

    expect(card).toContain("R$\u00a00,00");
    expect(card).toContain("Moranguinho atenta ao saldo baixo");
    expect(card).toContain("O saldo está baixo. Vale acompanhar os próximos gastos.");
  });
});
