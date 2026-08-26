import { describe, expect, test } from "vitest";
import { STRAWBERRY_DECORATIVE_ASSETS } from "./strawberryAssets";

describe("strawberry decorative assets", () => {
  test("declares transparent mascots for the summary cards", () => {
    expect(STRAWBERRY_DECORATIVE_ASSETS.custard).toContain("custard");
    expect(STRAWBERRY_DECORATIVE_ASSETS.pupcake).toContain("pupcake");
    expect(STRAWBERRY_DECORATIVE_ASSETS.pupcake).not.toContain(".jpg");
  });
});
