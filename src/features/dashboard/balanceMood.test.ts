import { expect, it } from "vitest";
import { balanceMoodFor } from "./balanceMood";

it.each([
  [-1, "debt"],
  [0, "alert"],
  [4_999, "alert"],
  [5_000, "recovering"],
  [15_000, "recovering"],
  [15_001, "steady"],
  [30_000, "steady"],
  [30_001, "happy"],
  [50_000, "happy"],
  [50_001, "celebrating"],
] as const)("maps %i", (cents, mood) =>
  expect(balanceMoodFor(cents)).toBe(mood),
);
