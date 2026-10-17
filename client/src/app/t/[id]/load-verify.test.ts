import { describe, expect, it, vi } from "vitest";
import { loadVerify } from "./load-verify";

const view = {
  valid: true,
  revoked: false,
  number: "TB-2026-0001",
  studentName: "Ali Valiyev",
  level: "A1",
  from: "2026-09-01",
  to: "2026-10-16",
  issuedAt: "2026-10-17T20:30:00.000Z",
  companyName: "DaF Sprachzentrum",
};

const answering = (status: number, body: unknown = view) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("loadVerify", () => {
  it("200 -> the server's view", async () => {
    expect(await loadVerify("abc", answering(200))).toEqual({ kind: "ok", data: view });
  });

  it("404 is the only answer that means «not issued»", async () => {
    expect(await loadVerify("abc", answering(404, { message: "Hujjat topilmadi" }))).toEqual({
      kind: "not-found",
    });
  });

  // A genuine document must never read as fake because the server was busy or down.
  it.each([429, 500, 502, 503])("%i -> unavailable, no verdict", async (status) => {
    expect(await loadVerify("abc", answering(status, {}))).toEqual({ kind: "unavailable" });
  });

  it("a network error -> unavailable", async () => {
    expect(await loadVerify("abc", vi.fn().mockRejectedValue(new Error("ECONNRESET")))).toEqual({
      kind: "unavailable",
    });
  });

  it("a 200 whose body is not JSON -> unavailable", async () => {
    const broken = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect(await loadVerify("abc", broken)).toEqual({ kind: "unavailable" });
  });

  // «haqiqiy» / «bekor qilingan» is a live verdict: a cached page would keep saying «haqiqiy» after a revoke.
  it("asks the server every time: no-store, and no revalidate window", async () => {
    const fetchImpl = answering(200);
    await loadVerify("a/b c", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/\/participation-certificates\/a%2Fb%20c\/verify$/);
    expect(init).toMatchObject({ cache: "no-store" });
    // A hanging API must end the request (and the page) instead of waiting for ever.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  // The timer fires as a TimeoutError (a hanging API), a navigation away as an AbortError: neither is a verdict.
  it.each(["TimeoutError", "AbortError"])("a %s from the fetch -> unavailable, never «not issued»", async (name) => {
    const timedOut = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", name));
    expect(await loadVerify("abc", timedOut)).toEqual({ kind: "unavailable" });
  });

  it("gives up on an API that never answers: the 8 s timer's signal aborts the fetch", async () => {
    // The timer itself is Node's; here the signal it would hand out is driven by hand.
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const hanging = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    try {
      const pending = loadVerify("abc", hanging as unknown as typeof fetch);
      expect(timeout).toHaveBeenCalledWith(8000);
      controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
      expect(await pending).toEqual({ kind: "unavailable" });
    } finally {
      timeout.mockRestore();
    }
  });
});
