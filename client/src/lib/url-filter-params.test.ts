import { describe, expect, it } from "vitest";
import {
  listParam,
  parseArrayParam,
  readFilters,
  writeFilters,
  type FilterSchema,
} from "./url-filter-params";

const schema: FilterSchema = {
  search: { type: "string", defaultValue: "" },
  role: { type: "array", defaultValue: [] },
  page: { type: "number", defaultValue: 1 },
};

describe("parseArrayParam", () => {
  it("vergulli satrni ro'yxatga aylantiradi", () => {
    expect(parseArrayParam("CEO,Teacher")).toEqual(["CEO", "Teacher"]);
  });

  it("bo'shliq va bo'sh bo'laklarni tashlaydi", () => {
    expect(parseArrayParam(" CEO , , Teacher ")).toEqual(["CEO", "Teacher"]);
  });

  it("parametr yo'q bo'lsa bo'sh ro'yxat — «hammasi»", () => {
    expect(parseArrayParam(null)).toEqual([]);
  });
});

describe("readFilters", () => {
  it("massiv filtrini o'qiydi", () => {
    const f = readFilters(schema, new URLSearchParams("role=CEO,Cashier"));
    expect(f.role).toEqual(["CEO", "Cashier"]);
  });

  it("massiv yo'q bo'lsa bo'sh ro'yxat qaytaradi, defaultValue emas", () => {
    expect(readFilters(schema, new URLSearchParams("")).role).toEqual([]);
  });

  it("son va satr filtrlari avvalgidek ishlaydi", () => {
    const f = readFilters(schema, new URLSearchParams("page=3&search=ali"));
    expect(f.page).toBe(3);
    expect(f.search).toBe("ali");
  });

  it("buzuq sonda standart qiymatga qaytadi", () => {
    expect(readFilters(schema, new URLSearchParams("page=abc")).page).toBe(1);
  });
});

describe("writeFilters", () => {
  it("tanlanganlarni vergul bilan yozadi", () => {
    const qs = writeFilters(schema, new URLSearchParams(), {
      role: ["CEO", "Teacher"],
      page: 1,
      search: "",
    });
    expect(qs.toString()).toBe("role=CEO%2CTeacher");
  });

  it("bo'sh ro'yxat parametrni URL'dan o'chiradi", () => {
    const qs = writeFilters(schema, new URLSearchParams("role=CEO&page=2"), {
      role: [],
      page: 2,
      search: "",
    });
    expect(qs.get("role")).toBeNull();
    expect(qs.get("page")).toBe("2");
  });

  it("sxemaga kirmagan parametrga tegmaydi", () => {
    const qs = writeFilters(schema, new URLSearchParams("tab=qarzdorlar"), {
      role: [],
      page: 1,
      search: "",
    });
    expect(qs.get("tab")).toBe("qarzdorlar");
  });

  it("o'qish va yozish teskari amal — aylanib qaytadi", () => {
    const written = writeFilters(schema, new URLSearchParams(), {
      role: ["A", "B"],
      page: 4,
      search: "x",
    });
    expect(readFilters(schema, written)).toEqual({
      role: ["A", "B"],
      page: 4,
      search: "x",
    });
  });
});

describe("listParam", () => {
  it("bo'sh ro'yxat uchun undefined — parametr yuborilmaydi", () => {
    expect(listParam([])).toBeUndefined();
  });

  it("to'la ro'yxatni vergul bilan qo'shadi", () => {
    expect(listParam(["A1", "A2"])).toBe("A1,A2");
  });
});
