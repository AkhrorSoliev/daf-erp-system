import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DepartedStudentsTable,
  type DepartedStudentRow,
} from "./departed-students-table";

const row: DepartedStudentRow = {
  id: "10001",
  student: { id: 10001, fullName: "Test 10001" },
  phone: "901234567",
  status: "ACTIVE",
  balance: 0,
  lastGroup: { id: "g1", name: "A1-01" },
  branch: { id: 1, name: "Farg'ona" },
  course: { id: "c1", name: "A1" },
  teachers: [{ id: 501, fullName: "Ali Valiyev" }],
  departedAt: "2026-09-03T09:00:00.000Z",
  state: "confirmed",
  stopKind: "LEFT_GROUP",
};

function render(rows: DepartedStudentRow[]): string {
  return renderToStaticMarkup(
    createElement(DepartedStudentsTable, {
      data: rows,
      isLoading: false,
      page: 1,
      pageSize: 10,
      statusFilter: "all",
      onStatusFilterChange: () => {},
      debtorsOnly: false,
      onDebtorsOnlyChange: () => {},
    }),
  );
}

describe("DepartedStudentsTable", () => {
  it("shows the departure day", () => {
    const html = render([row]);
    expect(html).toContain("03.09.2026");
    expect(html).not.toContain("—");
  });

  // An API older than this client sends rows without these three fields.
  it("shows a dash instead of failing when a row has no departure day", () => {
    const older: Partial<DepartedStudentRow> = { ...row };
    delete older.departedAt;
    delete older.state;
    delete older.stopKind;
    const html = render([older as DepartedStudentRow]);
    expect(html).toContain("Test 10001");
    // Every other cell of this row has a value; the dash is the day's.
    expect(html.match(/—/g)).toHaveLength(1);
    expect(html).not.toContain("kutilmoqda");
  });

  it("marks only a pending row as waiting", () => {
    const html = render([
      row,
      {
        ...row,
        id: "10002",
        student: { id: 10002, fullName: "Test 10002" },
        state: "pending",
      },
    ]);
    expect(html.match(/kutilmoqda/g)).toHaveLength(1);
  });
});
