import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

import {
  eslatmalarMutation,
  guruhlarQuery,
  ligaQuery,
  sozHisobiniEskirt,
  uebungSeansQuery,
  wiederholungQuery,
} from "./queries";
import type { Fortschritt, Maqsad, PublicFrage } from "./types";

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

describe("liga va guruhlar so'rovlari", () => {
  it("tab ko'rinmaguncha so'ramaydi, kesh qisqa", () => {
    expect(ligaQuery().enabled).toBe(true);
    expect(ligaQuery(false).enabled).toBe(false);
    expect(guruhlarQuery(false).enabled).toBe(false);
    expect(ligaQuery().queryKey).toEqual(["lernen", "liga"]);
    expect(guruhlarQuery().queryKey).toEqual(["lernen", "guruhlar"]);
    expect(ligaQuery().staleTime).toBe(30_000);
    expect(guruhlarQuery().staleTime).toBe(30_000);
  });
});

describe("eslatmalarMutation — almashtirgich darrov saqlanadi (spec S4 §7)", () => {
  const KEY = ["lernen", "fortschritt"];
  const boshlangich = { eslatmalar: true, telegramUlangan: true } as Fortschritt;

  it("so'rovdan oldin ko'rinadi, server javobi bilan qoladi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, boshlangich);
    let sorovPaytida: boolean | undefined;
    // `as never`: the axios generic signature is not worth restating in a test.
    vi.mocked(api.patch).mockImplementationOnce((async () => {
      sorovPaytida = qc.getQueryData<Fortschritt>(KEY)?.eslatmalar;
      return { data: { eslatmalar: false } };
    }) as never);
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false);
    expect(api.patch).toHaveBeenCalledWith("/student-portal/lernen/eslatmalar", { yoqilgan: false });
    expect(sorovPaytida).toBe(false);
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(false);
  });

  it("xato — eski holatga qaytadi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, boshlangich);
    vi.mocked(api.patch).mockRejectedValueOnce(new Error("network"));
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false).catch(() => undefined);
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(true);
  });
});

describe("eslatmalarMutation — poyga va tor qaytarish (fix round 1)", () => {
  const KEY = ["lernen", "fortschritt"];
  const server = { eslatmalar: true, telegramUlangan: true } as Fortschritt;

  it("ikki tez bosish, ikkalasi xato — kesh serverdagi asl qiymatda qoladi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, server);
    // The server never changed: a refetch returns the original value.
    const observer = new QueryObserver(qc, {
      queryKey: KEY,
      queryFn: async () => server,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    vi.mocked(api.patch).mockRejectedValue(new Error("network"));
    const a = new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false).catch(() => undefined);
    const b = new MutationObserver(qc, eslatmalarMutation(qc)).mutate(true).catch(() => undefined);
    await Promise.all([a, b]);
    unsubscribe();
    vi.mocked(api.patch).mockReset();
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(true);
  });

  it("so'rov paytidagi boshqa maydon (maqsad) qaytarishdan keyin ham saqlanadi", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, server);
    const yangiMaqsad: Maqsad = { daraja: "ORTA", ball: 20, hozir: 5, bajarildi: false, bosh: false };
    vi.mocked(api.patch).mockImplementationOnce((async () => {
      qc.setQueryData<Fortschritt>(KEY, (old) => old && { ...old, maqsad: yangiMaqsad });
      throw new Error("network");
    }) as never);
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false).catch(() => undefined);
    const keshda = qc.getQueryData<Fortschritt>(KEY);
    expect(keshda?.eslatmalar).toBe(true);
    expect(keshda?.maqsad).toEqual(yangiMaqsad);
  });

  it("server so'ralganidan boshqa qiymat qaytarsa — keshda server qiymati", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, server);
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { eslatmalar: true } } as never);
    await new MutationObserver(qc, eslatmalarMutation(qc)).mutate(false);
    expect(qc.getQueryData<Fortschritt>(KEY)?.eslatmalar).toBe(true);
  });
});
