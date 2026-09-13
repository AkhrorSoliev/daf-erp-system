import { describe, expect, it, vi } from "vitest";
import { natijaFor, yubor } from "./activity-sender";

const payload = {
  sessionId: "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f",
  platform: "WEB" as const,
  activeSeconds: 60,
  radioSeconds: 0,
  sections: { LERNEN: 60, OTHER: 0 },
};

describe("natijaFor", () => {
  it("2xx ok; 400/403/409 rad (qayta yuborishdan foyda yo'q); qolgani xato (keyin qayta)", () => {
    expect(natijaFor(201)).toBe("ok");
    expect(natijaFor(400)).toBe("rad");
    expect(natijaFor(403)).toBe("rad");
    expect(natijaFor(409)).toBe("rad");
    expect(natijaFor(401)).toBe("xato");
    expect(natijaFor(404)).toBe("xato");
    expect(natijaFor(500)).toBe("xato");
  });
});

describe("yubor", () => {
  it("keepalive POST, Bearer token, JSON tana", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 201 }));
    const javob = await yubor(payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      token: "tok",
      base: "https://api.test/api",
    });
    expect(javob).toEqual({ natija: "ok", status: 201 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.test/api/student-portal/activity");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("javob statusni ham qaytaradi — chaqiruvchi 400ni 403/409dan ajrata oladi", async () => {
    const fetchFn400 = vi.fn(async () => new Response(null, { status: 400 }));
    expect(
      await yubor(payload, {
        fetchFn: fetchFn400 as unknown as typeof fetch,
        token: "t",
        base: "x",
      }),
    ).toEqual({ natija: "rad", status: 400 });

    const fetchFn403 = vi.fn(async () => new Response(null, { status: 403 }));
    expect(
      await yubor(payload, {
        fetchFn: fetchFn403 as unknown as typeof fetch,
        token: "t",
        base: "x",
      }),
    ).toEqual({ natija: "rad", status: 403 });
  });

  it("token yoki manzil yo'q — so'rov yuborilmaydi, xato, status yo'q", async () => {
    const fetchFn = vi.fn();
    expect(
      await yubor(payload, {
        fetchFn: fetchFn as unknown as typeof fetch,
        token: undefined,
        base: "x",
      }),
    ).toEqual({
      natija: "xato",
      status: null,
    });
    expect(
      await yubor(payload, {
        fetchFn: fetchFn as unknown as typeof fetch,
        token: "t",
        base: undefined,
      }),
    ).toEqual({
      natija: "xato",
      status: null,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("tarmoq xatosi — xato, status yo'q", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(
      await yubor(payload, {
        fetchFn: fetchFn as unknown as typeof fetch,
        token: "t",
        base: "x",
      }),
    ).toEqual({
      natija: "xato",
      status: null,
    });
  });
});
