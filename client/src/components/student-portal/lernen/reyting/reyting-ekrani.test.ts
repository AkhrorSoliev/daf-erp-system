import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { REYTING_TABLARI } from "./reyting-ekrani";

describe("Reyting tablari", () => {
  // 390 px da besh tab sig'maydi — to'rtta; «Markaz» Liga ichiga ko'chdi.
  it("to'rt tab, Liga birinchi", () => {
    expect(REYTING_TABLARI.map((t) => t.label)).toEqual(["Liga", "Guruhim", "Guruhlar", "Darajam"]);
  });
});
