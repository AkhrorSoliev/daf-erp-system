import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadVerify = vi.hoisted(() => vi.fn());
vi.mock("./load-verify", () => ({ loadVerify }));

import CertificateVerifyPage from "./page";

// Made-up document.
const view = {
  valid: true,
  revoked: false,
  number: "TB-2026-0001",
  studentName: "Ali Valiyev",
  level: "A1",
  from: "2026-09-01",
  to: "2026-10-16",
  issuedAt: "2026-10-17T07:00:00.000Z",
  companyName: "DaF Sprachzentrum",
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

async function renderPage() {
  const node = await CertificateVerifyPage({ params: Promise.resolve({ id: "abc" }) });
  return norm(renderToStaticMarkup(node));
}

beforeEach(() => loadVerify.mockReset());

describe("the public QR page", () => {
  it("a standing document reads «haqiqiy»", async () => {
    loadVerify.mockResolvedValue({ kind: "ok", data: view });
    const text = await renderPage();
    expect(text).toContain("Bu hujjat haqiqiy");
    expect(text).not.toContain("bekor qilingan");
  });

  it("a cancelled document reads «bekor qilingan» and never «haqiqiy»", async () => {
    loadVerify.mockResolvedValue({ kind: "ok", data: { ...view, valid: false, revoked: true } });
    const text = await renderPage();
    expect(text).toContain("Bu hujjat bekor qilingan");
    expect(text).not.toContain("haqiqiy");
  });

  // The server never sends the reason; even if a payload carried it, the page has no place to print it.
  it("does not print a cancel reason, even one that slipped into the payload", async () => {
    loadVerify.mockResolvedValue({
      kind: "ok",
      data: { ...view, valid: false, revoked: true, revokedReason: "Noto'g'ri o'quvchiga berilgan", revokedAt: "2026-10-18T07:00:00.000Z" },
    });
    const text = await renderPage();
    expect(text).not.toContain("Noto'g'ri o'quvchiga berilgan");
    expect(text).not.toContain("Sabab");
    expect(text).not.toContain("18.10.2026");
  });
});
