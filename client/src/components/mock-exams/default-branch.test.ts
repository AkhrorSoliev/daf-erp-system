import { describe, expect, it } from "vitest";
import { pickDefaultBranchId } from "./default-branch";

const BRANCHES = [{ id: 1 }, { id: 7 }, { id: 9 }];

// Aylantirish oynasi ro'yxatdagi BIRINCHI filialni tanlab qo'yardi — imtihon
// boshqa filialniki bo'lsa, admin sezmay o'quvchini noto'g'ri filialga yozardi.
describe("oldindan tanlanadigan filial", () => {
  it("birinchi mos keladigan afzal filialni oladi", () => {
    expect(pickDefaultBranchId(BRANCHES, [7, 9])).toBe(7);
  });

  it("afzal filial ro'yxatda bo'lmasa keyingisiga o'tadi", () => {
    expect(pickDefaultBranchId(BRANCHES, [42, null, 9])).toBe(9);
  });

  it("hech biri mos kelmasa birinchi filial", () => {
    expect(pickDefaultBranchId(BRANCHES, [null, undefined])).toBe(1);
  });

  it("filial yo'q bo'lsa null", () => {
    expect(pickDefaultBranchId([], [7])).toBeNull();
  });
});
