import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./load-dictionary", () => ({ loadDictionary: vi.fn() }));

import { loadDictionary } from "./load-dictionary";
import type { UiLocale } from "./locales";

const load = vi.mocked(loadDictionary);

// The tags as plain fields, whichever state the promise is in.
const tags = (thenable: unknown) => thenable as { status: string; value?: unknown };

// A fresh module per test: the cache is module-level.
async function freshCache() {
  vi.resetModules();
  return import("./dictionary-cache");
}

describe("dictionary cache", () => {
  beforeEach(() => {
    load.mockReset();
    load.mockImplementation(async (locale: UiLocale): Promise<Record<string, string>> => (locale === "uz" ? {} : { "Bosh sahifa": `[${locale}]` }));
  });

  it("has uz settled from the start, without calling the loader", async () => {
    const { getDictionary } = await freshCache();
    const thenable = getDictionary("uz");
    expect(tags(thenable).status).toBe("fulfilled");
    expect(tags(thenable).value).toEqual({});
    expect(load).not.toHaveBeenCalled();
  });

  it("returns the same promise for the same locale and loads once", async () => {
    const { getDictionary } = await freshCache();
    const first = getDictionary("ru");
    await first;
    expect(getDictionary("ru")).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed load for a while (use() throws instead of looping), then a read loads again", async () => {
    vi.useFakeTimers();
    try {
      const { getDictionary, RETRY_AFTER_MS } = await freshCache();
      load.mockRejectedValueOnce(new Error("ChunkLoadError"));
      const failed = getDictionary("ru");
      await expect(failed).rejects.toThrow("ChunkLoadError");
      expect(tags(failed).status).toBe("rejected");
      expect(getDictionary("ru")).toBe(failed);
      vi.advanceTimersByTime(RETRY_AFTER_MS);
      const retry = getDictionary("ru");
      expect(retry).not.toBe(failed);
      await expect(retry).resolves.toEqual({ "Bosh sahifa": "[ru]" });
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rememberDictionary makes the next read fulfilled without loading", async () => {
    const { getDictionary, rememberDictionary } = await freshCache();
    rememberDictionary("de", { "Bosh sahifa": "Startseite" });
    const thenable = getDictionary("de");
    expect(tags(thenable).status).toBe("fulfilled");
    expect(tags(thenable).value).toEqual({ "Bosh sahifa": "Startseite" });
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the locales apart", async () => {
    const { getDictionary } = await freshCache();
    expect(getDictionary("ru")).not.toBe(getDictionary("en"));
    await expect(getDictionary("en")).resolves.toEqual({ "Bosh sahifa": "[en]" });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
