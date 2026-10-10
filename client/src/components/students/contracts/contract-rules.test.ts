import { describe, expect, it } from "vitest";
import {
  ageOn,
  canCancel,
  courseDraftFromPrefill,
  createBody,
  customerDraft,
  dayString,
  dateValue,
  formProblem,
  initialKind,
  isMinor,
  upsertContract,
} from "./contract-rules";
import type { ContractPrefill, ContractView } from "./contract-types";

const prefill = (over: Partial<ContractPrefill> = {}): ContractPrefill => ({
  today: "2026-10-10",
  branch: { name: "Namangan filiali", missing: [] },
  student: {
    fullName: "Soliyev Ahror",
    birthDate: "2012-01-01",
    isMinor: true,
    phone: "901234567",
    telegram: "@ahror",
    passport: null,
    address: "Namangan",
    parentName: "Soliyeva Malika",
    parentPhone: "907654321",
  },
  lastCustomer: null,
  courses: [
    {
      enrollmentId: "e-1",
      status: "ACTIVE",
      courseName: "Standart",
      groupName: "#032",
      contractNumber: null,
      monthlyPrice: 450000,
      discountPercent: 10,
      firstPaymentAmount: 405000,
    },
  ],
  ...over,
});

const contract = (over: Partial<ContractView> = {}): ContractView =>
  ({
    id: "doc-1",
    number: "DAF-2026-00001",
    status: "UNSIGNED",
    links: [{ enrollmentId: "e-1", status: "ACTIVE", groupName: "#032" }],
    ...over,
  }) as ContractView;

describe("age", () => {
  it("turns 18 on the birthday", () => {
    expect(ageOn("2008-10-10", "2026-10-09")).toBe(17);
    expect(ageOn("2008-10-10", "2026-10-10")).toBe(18);
    expect(isMinor(null, "2026-10-10")).toBeNull();
    expect(isMinor("2008-10-10", "2026-10-10")).toBe(false);
  });
});

describe("customer drafts", () => {
  it("starts a minor with the parent", () => {
    expect(initialKind(prefill())).toBe("PARENT");
    expect(customerDraft("PARENT", prefill())).toMatchObject({
      fullName: "Soliyeva Malika",
      phone: "907654321",
      address: "Namangan",
    });
  });

  it("starts an adult as their own customer, filled from the profile", () => {
    const adult = prefill({
      student: { ...prefill().student, birthDate: "1995-05-05", isMinor: false },
    });
    expect(initialKind(adult)).toBe("SELF");
    expect(customerDraft("SELF", adult)).toMatchObject({
      fullName: "Soliyev Ahror",
      birthDate: "1995-05-05",
      phone: "901234567",
      telegram: "@ahror",
    });
  });

  it("reuses what the last contract had for the same kind", () => {
    const p = prefill({
      lastCustomer: {
        kind: "PARENT",
        kindOther: null,
        fullName: "Soliyeva Malika",
        birthDate: "1980-03-04",
        passport: "AB1234567",
        address: "Namangan, Uychi 5",
        phone: "907654321",
        telegram: null,
        email: null,
      },
    });
    expect(initialKind(p)).toBe("PARENT");
    expect(customerDraft("PARENT", p)).toMatchObject({
      passport: "AB1234567",
      address: "Namangan, Uychi 5",
      birthDate: "1980-03-04",
    });
  });
});

describe("request body", () => {
  it("drops blanks and keeps the extras per course", () => {
    const body = createBody({
      studentId: 10001,
      enrollmentIds: ["e-1"],
      birthDate: "",
      customer: customerDraft("PARENT", prefill()),
      courses: {
        "e-1": { ...courseDraftFromPrefill(prefill().courses[0]), includes: ["DARSLIK"] },
      },
    });
    expect(body).toEqual({
      studentId: 10001,
      enrollmentIds: ["e-1"],
      studentBirthDate: undefined,
      customer: {
        kind: "PARENT",
        kindOther: undefined,
        fullName: "Soliyeva Malika",
        birthDate: undefined,
        passport: undefined,
        address: "Namangan",
        phone: "907654321",
        telegram: undefined,
        email: undefined,
      },
      courses: [
        {
          enrollmentId: "e-1",
          firstPaymentAmount: 405000,
          firstPaymentDate: undefined,
          discountReason: undefined,
          discountFrom: undefined,
          discountTo: undefined,
          includes: ["DARSLIK"],
        },
      ],
    });
  });

  it("explains why saving is not possible yet", () => {
    const customer = customerDraft("SELF", prefill());
    expect(formProblem({ enrollmentIds: [], customer, minor: false })).toMatch(/kursni/);
    expect(formProblem({ enrollmentIds: ["e-1"], customer, minor: true })).toMatch(/Voyaga/);
    expect(
      formProblem({
        enrollmentIds: ["e-1"],
        needsBirthDate: true,
        birthDate: "",
        customer,
        minor: null,
      }),
    ).toMatch(/tug'ilgan/);
    expect(formProblem({ enrollmentIds: ["e-1"], customer, minor: false })).toBeNull();
    expect(
      formProblem({ enrollmentIds: ["e-1"], customer, minor: false, branchMissing: ["shahar"] }),
    ).toMatch(/Filial sozlamasida shahar/);
  });
});

describe("list updates", () => {
  it("lets only the CEO cancel a signed contract", () => {
    expect(canCancel(contract(), false)).toBe(true);
    expect(canCancel(contract({ status: "SIGNED" }), false)).toBe(false);
    expect(canCancel(contract({ status: "SIGNED" }), true)).toBe(true);
    expect(canCancel(contract({ status: "CANCELLED" }), true)).toBe(false);
  });

  it("puts a new contract on top and takes its courses off the warning", () => {
    const next = upsertContract(
      {
        contracts: [],
        uncovered: [
          { enrollmentId: "e-1", status: "ACTIVE", courseName: "Standart", groupName: "#032" },
        ],
      },
      contract(),
    );
    expect(next.contracts.map((c) => c.id)).toEqual(["doc-1"]);
    expect(next.uncovered).toEqual([]);
  });

  it("replaces a contract it already has", () => {
    const next = upsertContract(
      { contracts: [contract()], uncovered: [] },
      contract({ status: "SIGNED" }),
    );
    expect(next.contracts).toHaveLength(1);
    expect(next.contracts[0].status).toBe("SIGNED");
  });
});

describe("days", () => {
  it("round-trips the date picker without a timezone shift", () => {
    expect(dayString(dateValue("2026-10-12"))).toBe("2026-10-12");
    expect(dateValue("")).toBeUndefined();
    expect(dayString(undefined)).toBe("");
  });
});
