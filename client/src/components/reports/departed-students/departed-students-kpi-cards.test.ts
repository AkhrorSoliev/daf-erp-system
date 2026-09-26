import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DepartedStudentsKpiCards,
  departedTooltip,
  type DepartedStudentsSummary,
} from "./departed-students-kpi-cards";

// Tooltip content renders in a portal, and only while open; render it inline
// so the markup carries each card's tooltip text.
vi.mock("@/components/ui/tooltip", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Tooltip: Pass,
    TooltipTrigger: Pass,
    TooltipContent: ({ children }: { children?: ReactNode }) =>
      createElement("span", { "data-tooltip": "" }, children),
  };
});

describe("departedTooltip", () => {
  const graceDays = { LEFT_GROUP: 21, FROZEN: 60 };

  it("names the grace period of each kind of stop", () => {
    expect(departedTooltip({ graceDays, pendingCount: 0 })).toBe(
      "Tanlangan davrda ketgan o'quvchilar, har biri bir marta.\n" +
        "Chetlatilgan kuni sanaladi. Guruhdan chiqqan o'quvchi 21 kun, " +
        "muzlatilgan o'quvchi 60 kun ichida qaytmasa, to'xtagan kuni sanaladi.",
    );
  });

  it("reads both periods from the API", () => {
    expect(
      departedTooltip({
        graceDays: { LEFT_GROUP: 7, FROZEN: 30 },
        pendingCount: 0,
      }),
    ).toContain("Guruhdan chiqqan o'quvchi 7 kun, muzlatilgan o'quvchi 30 kun");
  });

  it("says how many may still be added while some are pending", () => {
    expect(departedTooltip({ graceDays, pendingCount: 3 })).toMatch(
      /\nYana 3 nafari shu muddatda qaytmasa qo'shiladi\.$/,
    );
  });

  it("leaves that sentence out when nobody is pending", () => {
    const text = departedTooltip({ graceDays, pendingCount: 0 });
    expect(text).not.toContain("Yana");
    expect(text.endsWith("\n")).toBe(false);
  });
});

describe("DepartedStudentsKpiCards", () => {
  const graceDays = { LEFT_GROUP: 21, FROZEN: 60 };
  const summary: DepartedStudentsSummary = {
    churnRate: 40,
    departedCount: 2,
    activeAtStart: 5,
    pendingCount: 1,
    graceDays,
    lostRevenue: 400_000,
    totalDebt: -80_000,
    debtorCount: 2,
    avgDurationMonths: 4.4,
    totalTeacherChanges: 0,
    departedAfterTeacherChange: 0,
  };

  /** Each card's tooltip text, in card order; «Davrda ketganlar» is first. */
  function tooltips(data: DepartedStudentsSummary): string[] {
    const html = renderToStaticMarkup(
      createElement(DepartedStudentsKpiCards, { data, isLoading: false }),
    );
    return [...html.matchAll(/<span data-tooltip="">([\s\S]*?)<\/span>/g)].map(
      (m) => m[1].replaceAll("&#x27;", "'").replaceAll("&amp;", "&"),
    );
  }

  it("shows the full departed tooltip when the API sends the grace periods", () => {
    expect(tooltips(summary)[0]).toBe(
      departedTooltip({ graceDays, pendingCount: 1 }),
    );
  });

  // The API deployed before ADR-0035 sends none of these three fields.
  it("falls back to the first sentence instead of failing on an older summary", () => {
    const older: Partial<DepartedStudentsSummary> = { ...summary };
    delete older.graceDays;
    delete older.pendingCount;
    delete older.activeAtStart;

    let texts: string[] = [];
    expect(() => {
      texts = tooltips(older as DepartedStudentsSummary);
    }).not.toThrow();
    expect(texts[0]).toBe(
      "Tanlangan davrda ketgan o'quvchilar, har biri bir marta.",
    );
  });
});
