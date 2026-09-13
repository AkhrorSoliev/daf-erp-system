import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicFrage } from "./types";
import {
  boshla,
  ersatzKeldi,
  javobBerildi,
  joriy,
  seansIdYarat,
  tugadimi,
  urinishRaqami,
} from "./seans-navbat";

function f(id: number, format: PublicFrage["format"] = "WORT_UZ"): PublicFrage {
  return {
    index: id,
    format,
    itemType: "WORT",
    itemId: id,
    prompt: `savol ${id}`,
    hilfe: null,
    options: ["a", "b", "c", "d"],
    audioUrl: null,
  };
}

const OK = { isCorrect: true, richtig: "a" };
const XATO = { isCorrect: false, richtig: "a" };

describe("boshla", () => {
  it("navbatni va sanoqni tayyorlaydi", () => {
    const h = boshla([f(1), f(2), f(3)]);
    expect(h.jami).toBe(3);
    expect(h.tugatilgan).toBe(0);
    expect(h.togri).toBe(0);
    expect(joriy(h)?.itemId).toBe(1);
    expect(tugadimi(h)).toBe(false);
  });

  it("bo`sh ro`yxat darhol tugagan seans", () => {
    const h = boshla([]);
    expect(tugadimi(h)).toBe(true);
    expect(h.jami).toBe(0);
  });
});

describe("to`g`ri javob", () => {
  it("savolni tugatadi va keyingisiga o`tadi", () => {
    const { holat, ersatzSoralsinmi } = javobBerildi(boshla([f(1), f(2)]), OK);
    expect(ersatzSoralsinmi).toBe(false);
    expect(holat.tugatilgan).toBe(1);
    expect(holat.togri).toBe(1);
    expect(joriy(holat)?.itemId).toBe(2);
  });
});

describe("birinchi xato javob", () => {
  it("almashtiruvchi savol so`ralishini bildiradi", () => {
    const { holat, ersatzSoralsinmi } = javobBerildi(boshla([f(1), f(2)]), XATO);
    expect(ersatzSoralsinmi).toBe(true);
    // TUGATILMAGAN: savol hali qaytishi kerak.
    expect(holat.tugatilgan).toBe(0);
    expect(holat.togri).toBe(0);
    expect(joriy(holat)?.itemId).toBe(2);
  });

  it("xatoni to`g`ri javobi bilan yozib qo`yadi", () => {
    const { holat } = javobBerildi(boshla([f(1)]), { isCorrect: false, richtig: "das Haus" });
    expect(holat.xatolar).toEqual([
      {
        itemType: "WORT",
        itemId: 1,
        format: "WORT_UZ",
        prompt: "savol 1",
        richtig: "das Haus",
        titel: null,
      },
    ]);
  });
});

describe("xato yozuvi — format va titel", () => {
  // Ko'rik topilmasi: natija ekrani `DIALOG_LUECKE`/`ZUORDNEN` uchun
  // qisqa ko'rinish chizishi kerak — buning uchun `format`ni bilishi
  // shart, `DIALOG_LUECKE` uchun esa suhbat nomini (`titel`) ham.
  it("DIALOG_LUECKE savolining formati va titeli xato yozuviga o`tadi", () => {
    const dialogSavoli: PublicFrage = {
      index: 1,
      format: "DIALOG_LUECKE",
      itemType: "DIALOGZEILE",
      itemId: 9,
      prompt: "Jonas: ___\nMia: Ja, ich bin Mia.",
      hilfe: null,
      options: ["Hallo!", "a", "b", "c"],
      titel: "Bist du Mia?",
      audioUrl: null,
    };
    const { holat } = javobBerildi(boshla([dialogSavoli]), {
      isCorrect: false,
      richtig: "Hallo!",
    });
    expect(holat.xatolar).toEqual([
      {
        itemType: "DIALOGZEILE",
        itemId: 9,
        format: "DIALOG_LUECKE",
        prompt: "Jonas: ___\nMia: Ja, ich bin Mia.",
        richtig: "Hallo!",
        titel: "Bist du Mia?",
      },
    ]);
  });

  it("titel bo`lmagan savol uchun `null` yoziladi", () => {
    const { holat } = javobBerildi(boshla([f(1, "ZUORDNEN")]), {
      isCorrect: false,
      richtig: "a=b|c=d",
    });
    expect(holat.xatolar[0].titel).toBeNull();
    expect(holat.xatolar[0].format).toBe("ZUORDNEN");
  });
});

describe("almashtiruvchi savol", () => {
  it("navbat OXIRIGA qo`yiladi, darhol takrorlanmaydi", () => {
    const { holat } = javobBerildi(boshla([f(1), f(2), f(3)]), XATO);
    const h = ersatzKeldi(holat, f(1, "UZ_WORT"), 1);
    expect(h.navbat.map((q) => q.itemId)).toEqual([2, 3, 1]);
    expect(h.navbat[2].format).toBe("UZ_WORT");
  });

  it("null kelsa savol tugatilgan hisoblanadi", () => {
    // Material tugagan: boshqa format qurib bo`lmaydi. Bu xato emas —
    // dars davom etadi, so`z ertaga Leitner orqali qaytadi.
    const { holat } = javobBerildi(boshla([f(1)]), XATO);
    const h = ersatzKeldi(holat, null, 1);
    expect(h.tugatilgan).toBe(1);
    expect(h.togri).toBe(0);
    expect(tugadimi(h)).toBe(true);
  });
});

describe("qaytgan savol", () => {
  it("to`g`ri javob bersa tugaydi, lekin BALLGA kirmaydi", () => {
    // `bestScore` ta'rifi: birinchi urinishda to'g'ri bo'lganlar soni.
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"), 1);
    const c = javobBerildi(b, OK).holat;
    expect(c.tugatilgan).toBe(1);
    expect(c.togri).toBe(0);
    expect(tugadimi(c)).toBe(true);
  });

  it("ikkinchi marta ham xato bo`lsa TO`XTAYDI — ikkinchi qaytish yo`q", () => {
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"), 1);
    const c = javobBerildi(b, XATO);
    expect(c.ersatzSoralsinmi).toBe(false);
    expect(c.holat.tugatilgan).toBe(1);
    expect(tugadimi(c.holat)).toBe(true);
  });

  it("xatoni ikki marta yozmaydi", () => {
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"), 1);
    const c = javobBerildi(b, XATO).holat;
    expect(c.xatolar).toHaveLength(1);
  });
});

describe("sanoq", () => {
  it("tugatilgan hech qachon jamidan oshmaydi", () => {
    let h = boshla([f(1), f(2)]);
    const r1 = javobBerildi(h, XATO);
    h = ersatzKeldi(r1.holat, f(1, "ARTIKEL"), 1);
    h = javobBerildi(h, OK).holat; // 2-savol
    h = javobBerildi(h, OK).holat; // qaytgan 1-savol
    expect(h.tugatilgan).toBe(2);
    expect(h.jami).toBe(2);
    expect(tugadimi(h)).toBe(true);
  });

  it("kirish holatini o`zgartirmaydi", () => {
    const h = boshla([f(1), f(2)]);
    javobBerildi(h, OK);
    expect(h.tugatilgan).toBe(0);
    expect(h.navbat).toHaveLength(2);
  });
});

describe("bo`sh navbatda javob", () => {
  it("xato tashlaydi — bu chaqiruvchining xatosi", () => {
    expect(() => javobBerildi(boshla([]), OK)).toThrow();
  });
});

describe("seans konteksti", () => {
  it("boshla seansId beradi — uuid v4", () => {
    const h = boshla([f(1)]);
    expect(h.seansId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("berilgan seansId saqlanadi, javoblar uni o`zgartirmaydi", () => {
    const h = boshla([f(1), f(2)], "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f");
    const { holat } = javobBerildi(h, OK);
    expect(holat.seansId).toBe("3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f");
  });

  it("urinishRaqami: asl savol 1, qaytgan savol 2", () => {
    const h = boshla([f(1), f(2)]);
    expect(urinishRaqami(h, f(1))).toBe(1);
    const { holat } = javobBerildi(h, XATO); // f(1) qaytadi
    const h2 = ersatzKeldi(holat, f(1, "UZ_WORT"), 0);
    const qaytgan = h2.navbat[h2.navbat.length - 1];
    expect(urinishRaqami(h2, qaytgan)).toBe(2);
  });

  it("ersatzKeldi o`rinbosarga ASL savolning indeksini beradi", () => {
    const h = boshla([f(7), f(8)]);
    const { holat } = javobBerildi(h, XATO);
    // server o`rinbosarni doim index 0 bilan qaytaradi (`toPublic(nomzod, 0)`)
    const ersatz = { ...f(7, "UZ_WORT"), index: 0 };
    const h2 = ersatzKeldi(holat, ersatz, 7);
    expect(h2.navbat[h2.navbat.length - 1].index).toBe(7);
  });
});

describe("seansIdYarat — zaxira (I2)", () => {
  const asliyCrypto = globalThis.crypto;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("crypto.randomUUID yo`q eski brauzerda ham v4 uuid yaratadi", () => {
    // `crypto.randomUUID` YO'Q soxta `crypto` — eski telefon/WebView holati.
    vi.stubGlobal("crypto", {
      getRandomValues: asliyCrypto.getRandomValues.bind(asliyCrypto),
    });
    const id = seansIdYarat();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("zaxira yo`lida ham ikki chaqiruv boshqa-boshqa id beradi", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: asliyCrypto.getRandomValues.bind(asliyCrypto),
    });
    expect(seansIdYarat()).not.toBe(seansIdYarat());
  });

  it("crypto.randomUUID bor bo`lsa o`shani ishlatadi", () => {
    const id = seansIdYarat();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
