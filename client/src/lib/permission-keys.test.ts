import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "./permission-keys";
import { loadServerCatalog } from "@/test-support/server-catalog";

describe("PERMISSION_KEYS", () => {
  it("is exactly the server catalog's list, in the same order", () => {
    expect([...PERMISSION_KEYS]).toEqual(loadServerCatalog().PERMISSION_KEYS);
  });
});
