import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import { loadServerCatalog } from "@/test-support/server-catalog";
import {
  DANGER_WARNING,
  cellState,
  confirmCopy,
  depGraph,
  historyLine,
  planCellToggle,
  resetCopy,
  sectionCount,
  sectionCountLabel,
} from "./permissions-model";
import type { PermissionsOverview } from "./permissions-types";

const D = 2;
const A = 3;
const T = 4;
const K = 5;

interface ServerDef {
  section: string;
  label: string;
  requires: readonly string[];
  defaultRoles: readonly number[];
  allowedRoles: readonly number[];
  lockReasons: Readonly<Partial<Record<number, string>>>;
  danger?: "money" | "irreversible";
}

// The loader returns every export of the server's permission-catalog.ts.
const server = loadServerCatalog() as unknown as {
  PERMISSION_KEYS: PermissionKey[];
  PERMISSIONS: Record<string, ServerDef>;
  PERMISSION_SECTIONS: readonly { key: string; label: string }[];
  defaultKeysForRoles: (roleIds: readonly number[]) => Set<string>;
};

const defaults = (roleId: number): string[] => [...server.defaultKeysForRoles([roleId])];

/** `GET /permissions` as the server answers it: the real catalog; defaults unless `granted` says otherwise. */
function overview(granted: Partial<Record<number, string[]>> = {}): PermissionsOverview {
  return {
    sections: server.PERMISSION_SECTIONS.map(({ key, label }) => ({ key, label })),
    roles: [
      { id: D, label: "Filial direktori" },
      { id: A, label: "Administrator" },
      { id: K, label: "Kassir" },
      { id: T, label: "O'qituvchi" },
    ],
    catalog: server.PERMISSION_KEYS.map((key) => {
      const d = server.PERMISSIONS[key];
      return {
        key,
        section: d.section,
        label: d.label,
        requires: [...d.requires] as PermissionKey[],
        defaultRoles: [...d.defaultRoles],
        allowedRoles: [...d.allowedRoles],
        lockReasons: { ...d.lockReasons },
        danger: d.danger ?? null,
      };
    }),
    granted: Object.fromEntries(
      [D, A, K, T].map((r) => [r, [...(granted[r] ?? defaults(r))].sort() as PermissionKey[]]),
    ),
  };
}

const LABEL = (key: string) => server.PERMISSIONS[key].label;

describe("depGraph", () => {
  it("has every catalog key with its requirements", () => {
    const g = depGraph(overview());
    expect(Object.keys(g)).toHaveLength(server.PERMISSION_KEYS.length);
    expect(g["refunds.cancel"].requires).toEqual(["refunds.create"]);
  });
});

describe("cellState", () => {
  it("an allowed cell at its default: no lock, no dot", () => {
    expect(cellState(overview(), "students.profile", K)).toEqual({
      granted: true,
      locked: false,
      lockReason: null,
      differs: false,
      danger: null,
    });
  });

  it("a teacher's locked cell carries the reason the page shows", () => {
    expect(cellState(overview(), "students.list", T)).toEqual({
      granted: false,
      locked: true,
      lockReason: "o'qituvchi faqat o'z guruhlarini ko'radi",
      differs: false,
      danger: null,
    });
  });

  it("a CEO-only key is locked for every role and keeps its red mark", () => {
    for (const roleId of [D, A, K, T]) {
      expect(cellState(overview(), "salary.close", roleId)).toMatchObject({
        locked: true,
        lockReason: "butun kompaniyaga ta'sir qiladi",
        danger: "money",
      });
    }
  });

  it("yellow dot: a grant beyond the default and a revoked default both differ", () => {
    const o = overview({
      [K]: [...defaults(K), "students.details"],
      [A]: defaults(A).filter((k) => k !== "students.sms"),
    });
    expect(cellState(o, "students.details", K)).toMatchObject({ granted: true, differs: true });
    expect(cellState(o, "students.sms", A)).toMatchObject({ granted: false, differs: true });
    expect(cellState(o, "students.list", A)).toMatchObject({ granted: true, differs: false });
  });
});

describe("sectionCount", () => {
  it("counts only the cells the role may hold", () => {
    const o = overview();
    // salary.view, salary.rate, salary.pay open for D; rate-edit and close are CEO-only.
    expect(sectionCount(o, "salary", D)).toEqual({ on: 3, total: 3 });
    // K: salary.view and salary.pay open, none held by default.
    expect(sectionCount(o, "salary", K)).toEqual({ on: 0, total: 2 });
    // The teacher holds nothing in «O'quvchilar»: every cell is locked.
    expect(sectionCount(o, "students", T)).toEqual({ on: 0, total: 0 });
    // A: all 8 student keys open; 7 by default (not students.initial-balance).
    expect(sectionCount(o, "students", A)).toEqual({ on: 7, total: 8 });
  });

  it("follows the CEO's changes", () => {
    const o = overview({ [A]: defaults(A).filter((k) => k !== "students.sms") });
    expect(sectionCount(o, "students", A)).toEqual({ on: 6, total: 8 });
  });

  it("reads «N tadan M tasi»", () => {
    expect(sectionCountLabel({ on: 3, total: 5 })).toBe("5 tadan 3 tasi");
  });

  it("shows «—» for a section whose keys are all locked for the role", () => {
    expect(sectionCountLabel(sectionCount(overview(), "students", T))).toBe("—");
    expect(sectionCountLabel({ on: 0, total: 0 })).toBe("—");
    expect(sectionCountLabel({ on: 0, total: 2 })).toBe("2 tadan 0 tasi");
  });
});

describe("planCellToggle and confirmCopy", () => {
  it("turning on brings the requirement, lists it and warns about money", () => {
    const o = overview();
    const plan = planCellToggle(o, K, "refunds.cancel", true);
    expect(plan).toEqual({
      roleId: K,
      key: "refunds.cancel",
      on: true,
      also: ["refunds.create"],
      changes: [
        { key: "refunds.cancel", granted: true },
        { key: "refunds.create", granted: true },
      ],
      danger: true,
      refusal: null,
    });
    expect(confirmCopy(o, plan)).toEqual({
      title: "Kassir: «Pul qaytarish so'rovini bekor qilish» yoqilsinmi?",
      alsoTitle: "Birga yoqiladi",
      alsoLabels: ["O'quvchiga pul qaytarish"],
      warning: DANGER_WARNING,
      confirm: "Yoqish",
    });
  });

  it("turning off takes the dependents and does not warn", () => {
    const o = overview();
    const plan = planCellToggle(o, D, "lessons.change", false);
    expect(plan.also).toEqual(["lessons.change-delete"]);
    expect(plan.changes).toEqual([
      { key: "lessons.change", granted: false },
      { key: "lessons.change-delete", granted: false },
    ]);
    expect(plan.danger).toBe(false);
    expect(confirmCopy(o, plan)).toEqual({
      title:
        "Filial direktori: «Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish» o'chirilsinmi?",
      alsoTitle: "Birga o'chadi",
      alsoLabels: ["Bekor qilish, ko'chirish va o'rinbosarni o'chirish"],
      warning: null,
      confirm: "O'chirish",
    });
  });

  it("turning off reaches dependents of dependents, listed in catalog order", () => {
    const o = overview();
    const plan = planCellToggle(o, A, "students.profile", false);
    expect(plan.also).toContain("students.details");
    expect(plan.also).toContain("students.sms"); // through students.details
    expect(plan.also).not.toContain("students.profile");
    expect(confirmCopy(o, plan).alsoLabels[0]).toBe(LABEL("students.details"));
  });

  it("a money capability with nothing to bring: no list, still the warning", () => {
    const o = overview();
    const plan = planCellToggle(o, K, "balance.withdraw", true);
    expect(plan.also).toEqual([]);
    expect(confirmCopy(o, plan)).toMatchObject({ alsoTitle: null, alsoLabels: [], warning: DANGER_WARNING });
  });

  it("an already-on key changes only itself", () => {
    const plan = planCellToggle(overview(), D, "students.list", true);
    expect(plan.also).toEqual([]);
    expect(plan.changes).toEqual([{ key: "students.list", granted: true }]);
  });
});

describe("planCellToggle refusal", () => {
  it("a locked cell is refused with the server's wording and carries no changes", () => {
    const o = overview();
    const reason = "o'qituvchi faqat o'z guruhlarini ko'radi";
    const on = planCellToggle(o, T, "students.list", true);
    expect(on.refusal).toBe(`${LABEL("students.list")}: O'qituvchi uchun yoqib bo'lmaydi — ${reason}`);
    expect(on.changes).toEqual([]);
    expect(on.also).toEqual([]);
    expect(on.danger).toBe(false);
    expect(planCellToggle(o, T, "students.list", false).refusal).toBe(
      `${LABEL("students.list")}: O'qituvchi uchun o'zgartirib bo'lmaydi — ${reason}`,
    );
  });

  it("a grant that pulls in a key locked for the role is refused for the pulled-in key", () => {
    const o = overview();
    // A catalog that broke closure: refunds.create is no longer open to the cashier.
    o.catalog = o.catalog.map((e) =>
      e.key === "refunds.create" ? { ...e, allowedRoles: [D], lockReasons: { [K]: "sinov sababi" } } : e,
    );
    const plan = planCellToggle(o, K, "refunds.cancel", true);
    expect(plan.refusal).toBe(`${LABEL("refunds.create")}: Kassir uchun yoqib bo'lmaydi — sinov sababi`);
    expect(plan.changes).toEqual([]);
  });
});

describe("planCellToggle over the whole catalog", () => {
  const catalog = overview().catalog;
  for (const roleId of [D, A, T, K]) {
    it(`role ${roleId}: every plan is acceptable to the server, every open cell has one`, () => {
      const o = overview();
      const held = new Set<string>(o.granted[roleId]);
      for (const entry of catalog) {
        for (const on of [true, false]) {
          const plan = planCellToggle(o, roleId, entry.key, on);
          const locked = !entry.allowedRoles.includes(roleId);
          if (locked) {
            // (d)
            expect(plan.refusal, `${entry.key} locked`).not.toBeNull();
            expect(plan.changes).toEqual([]);
            continue;
          }
          const keys = plan.changes.map((c) => c.key);
          expect(new Set(keys).size).toBe(keys.length);
          const pulledLocked = keys.some((k) => !catalog.find((e) => e.key === k)!.allowedRoles.includes(roleId));
          // (a)
          if (plan.refusal === null) expect(pulledLocked, `${entry.key} ${on}`).toBe(false);
          // (c) the real catalog is closed under requires, so no open cell is refused
          expect(plan.refusal, `${entry.key} ${on}`).toBeNull();
          expect(plan.changes.length).toBeGreaterThan(0);
          // (b)
          const after = new Set(held);
          for (const c of plan.changes) {
            if (c.granted) after.add(c.key);
            else after.delete(c.key);
          }
          for (const k of after) {
            for (const r of catalog.find((e) => e.key === k)!.requires) {
              expect(after.has(r), `${entry.key} ${on}: ${k} needs ${r}`).toBe(true);
            }
          }
        }
      }
    });
  }
});

describe("resetCopy", () => {
  it("a role at its default has nothing to change", () => {
    expect(resetCopy(overview(), D)).toEqual({
      title: "Filial direktori: boshlang'ich holatga qaytarilsinmi?",
      lines: [],
    });
  });

  it("lists what comes back on and what goes off, in catalog order", () => {
    const o = overview({
      [A]: [...defaults(A).filter((k) => k !== "students.sms"), "students.initial-balance"],
    });
    expect(resetCopy(o, A)).toEqual({
      title: "Administrator: boshlang'ich holatga qaytarilsinmi?",
      lines: ["«O'quvchiga SMS yuborish» yoqiladi", "«Boshlang'ich balans kiritish» o'chadi"],
    });
  });
});

describe("historyLine", () => {
  const item = (roleId: number, changes: { key: string; granted: boolean }[]) => ({
    id: "h1",
    createdAt: "2026-10-12T09:00:00.000Z",
    roleId,
    changedBy: null,
    changes,
  });

  it("names the role and every change", () => {
    expect(
      historyLine(
        overview(),
        item(A, [
          { key: "students.sms", granted: false },
          { key: "students.initial-balance", granted: true },
        ]),
      ),
    ).toBe("Administrator: «O'quvchiga SMS yuborish» o'chirildi, «Boshlang'ich balans kiritish» yoqildi");
  });

  it("a key the catalog no longer has", () => {
    expect(historyLine(overview(), item(K, [{ key: "old.removed-key", granted: true }]))).toBe(
      "Kassir: o'chirilgan imkoniyat yoqildi",
    );
  });
});
