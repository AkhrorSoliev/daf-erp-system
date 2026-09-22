import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Manba matni bo'yicha qorovul (server tomonidagi AST qorovullari kabi).
//
// Nega: "Qarz kechirishga ruxsat" tugmasi — bu sozlamaning YAGONA yo'li.
// U yo'qolsa imkoniyat UI orqali umuman ochib bo'lmaydigan bo'lib qoladi,
// lekin client testlari komponent chizmagani uchun (jsdom/testing-library
// yo'q) tsc, eslint, vitest va build baribir yashil qolaveradi. Shuning
// uchun render qarorining o'zi shu yerda matn darajasida qulflanadi.
//
// Agar bu fayl qayta yozilsa — tugma va uning saveField chaqirig'i
// saqlanganiga ishonch hosil qilib, quyidagi kutilgan qiymatlarni
// yangilash mumkin. Ularni shunchaki o'chirib yuborish mumkin emas.

const SOURCE = readFileSync(
  join(__dirname, "payment-settings-client.tsx"),
  "utf-8",
);

describe("payment.debtWriteOffEnabled sozlamasi UI'da", () => {
  it("PaymentSettingsValues kaliti e'lon qilingan", () => {
    expect(SOURCE).toContain('"payment.debtWriteOffEnabled": boolean;');
  });

  it("Switch sozlama qiymatiga bog'langan", () => {
    expect(SOURCE).toContain(
      'checked={settings["payment.debtWriteOffEnabled"]}',
    );
  });

  it("o'zgartirish saveField orqali saqlanadi", () => {
    expect(SOURCE).toContain("saveField({ debtWriteOffEnabled: checked })");
  });

  it("ruxsatsiz yoki saqlash paytida tugma qulflanadi", () => {
    const row = SOURCE.slice(
      SOURCE.indexOf('checked={settings["payment.debtWriteOffEnabled"]}'),
    ).slice(0, 300);
    expect(row).toContain("disabled={!canEdit || saving}");
  });

  it("CEO ko'radigan nom va tushuntirish joyida", () => {
    expect(SOURCE).toContain("Qarz kechirishga ruxsat");
    // Standart holat o'chiq ekani va qarz yo'qolmasligi aytilishi shart.
    expect(SOURCE).toContain("standart holat");
    expect(SOURCE).toContain("hech qachon kechirilmaydi");
  });

  it("companyLevelOnly — filial override eslatmasi CHAQIRILMAYDI", () => {
    // Bu kalitni Filial direktori o'zi uchun yoqa olmaydi (backend rad
    // etadi), shuning uchun filial override hech qachon mavjud bo'lmaydi.
    // renderOverrideNote paydo bo'lsa — u har doim bo'sh chiqadi va CEO ga
    // yolg'on umid beradi.
    expect(SOURCE).not.toContain(
      'renderOverrideNote("payment.debtWriteOffEnabled")',
    );
  });
});
