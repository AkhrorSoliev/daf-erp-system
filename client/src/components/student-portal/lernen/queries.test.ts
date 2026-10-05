import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import {
  sozHisobiniEskirt,
  uebungSeansQuery,
  wiederholungQuery,
} from "./queries";
import type { PublicFrage } from "./types";

const frage = { index: 0 } as PublicFrage;
const gcTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Opens a round with a fake server, then leaves its screen. */
async function openAndLeave(
  qc: QueryClient,
  options: ReturnType<typeof uebungSeansQuery>,
): Promise<void> {
  const observer = new QueryObserver(qc, {
    ...options,
    queryFn: async () => [frage],
  });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual([frage]));
  unsubscribe();
  await gcTick();
}

describe("a round is not kept once its screen is left (ADR-0071)", () => {
  it("opening the lesson again asks the server for a new round", async () => {
    const qc = new QueryClient();
    await openAndLeave(qc, uebungSeansQuery(7));
    expect(qc.getQueryData(["lernen", "uebung", 7])).toBeUndefined();
  });

  it("the next review asks for fresh questions too", async () => {
    const qc = new QueryClient();
    await openAndLeave(qc, wiederholungQuery());
    expect(qc.getQueryData(["lernen", "wiederholung"])).toBeUndefined();
  });
});

describe("sozHisobiniEskirt — leaving a round marks the counters stale", () => {
  it("the unit page and the path refetch when they open next", () => {
    const qc = new QueryClient();
    qc.setQueryData(["lernen", "unit", 7], { id: 7 });
    qc.setQueryData(["lernen", "levels"], []);
    qc.setQueryData(["lernen", "grammar"], []);

    sozHisobiniEskirt(qc);

    expect(qc.getQueryState(["lernen", "unit", 7])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["lernen", "levels"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["lernen", "grammar"])?.isInvalidated).toBe(false);
  });
});
