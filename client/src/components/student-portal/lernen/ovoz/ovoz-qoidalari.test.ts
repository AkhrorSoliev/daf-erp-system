import { describe, expect, it } from "vitest";
import { ovozChalinsinmi } from "./ovoz-qoidalari";

describe("ovozChalinsinmi", () => {
  it("plays when the student wants sound and no lesson audio is playing", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: false, hodisa: "bos" })).toBe(true);
  });
  it("stays silent when the student switched sound off", () => {
    expect(ovozChalinsinmi({ yoqilgan: false, ijroEtilmoqda: false, hodisa: "togri" })).toBe(false);
  });
  it("never talks over a lesson clip", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: true, hodisa: "bos" })).toBe(false);
  });
  it("lets the reward through even over a clip (the lesson is over)", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: true, hodisa: "mukofot" })).toBe(true);
  });
});
