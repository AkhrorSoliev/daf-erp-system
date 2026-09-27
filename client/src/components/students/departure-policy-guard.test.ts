import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-text guards (the client tests render no components). Each one keeps
// a piece of contract 6.2 (ADR-0043) that tsc, eslint, vitest and the build
// would all let disappear silently.
const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf-8");

// Every screen that removes a student from a group. `onConfirm` hands the
// caller the chosen policy; a caller that takes the argument but builds its
// request without it would send every removal as the default — and a CEO's
// «Sifat bo'yicha shikoyat» would quietly keep the student's money.
const REMOVAL_CALLERS = [
  ["students", "student-profile-tabs.tsx"],
  ["students", "student-row-actions.tsx"],
  ["outreach", "removal-queue-tab.tsx"],
];

describe("contract 6.2 in the dialogs", () => {
  it.each(REMOVAL_CALLERS)(
    "%s/%s sends the chosen policy with the removal",
    (...path) => {
      const source = read(...path);
      expect(source).toContain("<StudentRemoveFromGroupDialog");
      expect(source).toContain("} = { ...money };");
      expect(source).toMatch(/studentId=\{/);
      expect(source).toMatch(/enrollmentId=\{/);
    },
  );

  it("the removal dialog shows the money block and waits for it", () => {
    const source = read("students", "student-remove-from-group-dialog.tsx");
    expect(source).toContain("<DepartureMoneyBlock");
    expect(source).toContain('context="removal"');
    expect(source).toContain('offeredPolicies("removal"');
    expect(source).toContain("departurePolicyPayload(");
    expect(source).toContain("money.isLoading");
  });

  it("an expulsion shows the money block and sends the policy; an archive does not", () => {
    const source = read("shared", "change-status-dialog.tsx");
    expect(source).toContain(
      'entityType === "students" && selectedStatus === "EXPELLED"',
    );
    expect(source).toContain("{isExpellingStudent && (");
    expect(source).toContain("...(isExpellingStudent");
    expect(source).toContain('context="expel"');
    expect(source).toContain('offeredPolicies("expel"');
  });

  it("the history names the money line", () => {
    expect(read("shared", "entity-history-utils.ts")).toContain('pul: "Pul"');
  });

  it("only the CEO edits the threshold", () => {
    const source = read("settings", "payment-settings-client.tsx");
    expect(source).toContain('"payment.noRefundAfterPercent": number;');
    const input = source.slice(source.indexOf('id="noRefundAfterPercent"'));
    expect(input.slice(0, 400)).toContain("disabled={!isCeo || saving}");
    expect(source).toContain("saveField({ noRefundAfterPercent: v })");
  });
});
