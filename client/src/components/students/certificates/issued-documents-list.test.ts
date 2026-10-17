import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IssuedDocumentsList } from "./issued-documents-list";
import type { IssuedCertificate } from "./certificate-types";

const live: IssuedCertificate = {
  id: "3f9c2a7e-5b1d-4c8a-9e60-2d7f81a4c0b3",
  number: "TB-2026-0001",
  level: "A1",
  issuedAt: "2026-10-17T07:00:00.000Z",
  exempt: false,
  revoked: false,
  revokedAt: null,
  revokedReason: null,
};
const cancelled: IssuedCertificate = {
  ...live,
  id: "9a8b7c6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d",
  number: "TB-2026-0002",
  revoked: true,
  revokedAt: "2026-10-18T07:00:00.000Z",
  revokedReason: "Noto'g'ri o'quvchiga berilgan",
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function render(rows: IssuedCertificate[], canRevoke: boolean) {
  return renderToStaticMarkup(
    createElement(IssuedDocumentsList, { rows, canRevoke, onDownload: vi.fn(), onRevoke: vi.fn() }),
  );
}

/** The <li> of one row, so a button on another row cannot satisfy the check. */
function rowHtml(html: string, number: string) {
  const items = html.split("<li").slice(1);
  const found = items.find((li) => li.includes(number));
  if (!found) throw new Error(`no row for ${number}`);
  return found;
}

describe("IssuedDocumentsList", () => {
  it("a cancelled row: struck-through number, the pill, the day and the reason, and no PDF button", () => {
    const html = render([cancelled], true);
    const li = rowHtml(html, "TB-2026-0002");
    expect(li).toMatch(/line-through[^>]*>TB-2026-0002/);
    const text = norm(li);
    expect(text).toContain("Bekor qilingan");
    expect(text).toContain("18.10.2026");
    expect(text).toContain("Sabab: Noto'g'ri o'quvchiga berilgan");
    expect(text).not.toContain("PDF");
    expect(li).not.toContain("Amallar");
  });

  it("a standing row keeps the PDF button and is not struck through", () => {
    const li = rowHtml(render([live], false), "TB-2026-0001");
    expect(li).not.toContain("line-through");
    expect(norm(li)).toContain("PDF");
  });

  it("the ⋯ menu («Amallar») is drawn on a standing row only for a caller who may cancel", () => {
    expect(rowHtml(render([live], true), "TB-2026-0001")).toContain("Amallar");
    expect(rowHtml(render([live], false), "TB-2026-0001")).not.toContain("Amallar");
  });

  it("mixes both kinds in one list", () => {
    const html = render([live, cancelled], true);
    expect(norm(rowHtml(html, "TB-2026-0001"))).toContain("PDF");
    expect(norm(rowHtml(html, "TB-2026-0002"))).not.toContain("PDF");
  });
});
