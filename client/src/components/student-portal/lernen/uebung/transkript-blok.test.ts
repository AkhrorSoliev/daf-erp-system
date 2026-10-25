import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TranskriptBlok } from "./transkript-blok";

const render = (zeilen: Array<{ sprecher: string; de: string; uz: string }>) =>
  renderToStaticMarkup(createElement(TranskriptBlok, { zeilen }));

describe("TranskriptBlok", () => {
  it("suhbatda so'zlovchi nomi va «Suhbat matni» chiqadi", () => {
    const html = render([{ sprecher: "Julia", de: "Hallo!", uz: "Salom!" }]);
    expect(html).toContain("Suhbat matni");
    expect(html).toContain("Julia");
  });

  it("jadval/e'longa so'zlovchi yo'q: bo'sh «: » va «Suhbat» yozuvi chiqmaydi", () => {
    const html = render([
      { sprecher: "", de: "Name | Das macht er gern", uz: "Ism | Buni yoqtiradi" },
    ]);
    expect(html).not.toContain("Suhbat matni");
    expect(html).toContain(">Matn<");
    expect(html).not.toContain(": </span>");
    expect(html).toContain("Name | Das macht er gern");
  });
});
