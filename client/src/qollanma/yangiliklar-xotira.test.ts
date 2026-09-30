import { afterEach, describe, expect, it, vi } from "vitest";

const kalit = (userId: number) => `daf.qollanma.yangiliklar.oxirgi.${userId}`;

/**
 * Brauzersiz `window`: xotira — Map, hodisalar — haqiqiy EventTarget.
 * `oqishXato` / `yozishXato` maxfiy oyna va taqiqni taqlid qiladi (getItem / setItem xato beradi).
 */
function oynaQur({ oqishXato = false, yozishXato = false } = {}) {
  const xotira = new Map<string, string>();
  const oyna = Object.assign(new EventTarget(), {
    localStorage: {
      getItem(k: string): string | null {
        if (oqishXato) throw new Error("taqiqlangan");
        return xotira.get(k) ?? null;
      },
      setItem(k: string, v: string): void {
        if (yozishXato) throw new Error("joy yo'q");
        xotira.set(k, v);
      },
    },
  });
  vi.stubGlobal("window", oyna);
  return { xotira, oyna };
}

/** Yangi modul = sahifa qayta yuklandi: sessiya Map'i bo'sh, xotira (oyna) qoladi. */
async function modul() {
  vi.resetModules();
  return import("./yangiliklar-xotira");
}

afterEach(() => vi.unstubAllGlobals());

describe("yangiliklar xotirasi", () => {
  it("foydalanuvchi bo'yicha alohida: birinchisining sanasi ikkinchisiga o'tmaydi", async () => {
    const { xotira } = oynaQur();
    const a = await modul();
    a.oxirgiKorilganniYoz(1, "2026-09-30");
    expect(a.oxirgiKorilganniOqi(1)).toBe("2026-09-30");
    expect(a.oxirgiKorilganniOqi(2)).toBeNull();
    expect([...xotira.keys()]).toEqual([kalit(1)]);

    const yangiVaraq = await modul();
    expect(yangiVaraq.oxirgiKorilganniOqi(1)).toBe("2026-09-30");
    expect(yangiVaraq.oxirgiKorilganniOqi(2)).toBeNull();
  });

  it("orqaga qaytmaydi: eski sana yangisini bosmaydi, o'zgarmagan yozuv xabar bermaydi", async () => {
    const { xotira } = oynaQur();
    const { oxirgiKorilganniOqi, oxirgiKorilganniYoz, yangiliklarObunasi } = await modul();
    const chaqir = vi.fn();
    yangiliklarObunasi(chaqir);

    oxirgiKorilganniYoz(1, "2026-10-05");
    oxirgiKorilganniYoz(1, "2026-09-30");
    oxirgiKorilganniYoz(1, "2026-10-05");

    expect(oxirgiKorilganniOqi(1)).toBe("2026-10-05");
    expect(xotira.get(kalit(1))).toBe("2026-10-05");
    expect(chaqir).toHaveBeenCalledTimes(1);
  });

  it("eski bundle'li varaq (sessiyasi bo'sh) xotiradagi yangiroq sanani bosmaydi", async () => {
    const { xotira } = oynaQur();
    xotira.set(kalit(1), "2026-10-05"); // boshqa varaq yozgan
    const eskiVaraq = await modul();

    eskiVaraq.oxirgiKorilganniYoz(1, "2026-09-30");

    expect(xotira.get(kalit(1))).toBe("2026-10-05");
    expect(eskiVaraq.oxirgiKorilganniOqi(1)).toBe("2026-10-05");
  });

  it("xotira o'qilmasa — undefined (belgi chiqmaydi)", async () => {
    oynaQur({ oqishXato: true });
    const { oxirgiKorilganniOqi } = await modul();
    expect(oxirgiKorilganniOqi(1)).toBeUndefined();
  });

  it("yozib bo'lmasa ham shu sessiyada qiymat qaytadi va obunachilarga xabar ketadi", async () => {
    const { xotira } = oynaQur({ yozishXato: true });
    const { oxirgiKorilganniOqi, oxirgiKorilganniYoz, yangiliklarObunasi } = await modul();
    const chaqir = vi.fn();
    yangiliklarObunasi(chaqir);

    expect(() => oxirgiKorilganniYoz(1, "2026-09-30")).not.toThrow();

    expect(oxirgiKorilganniOqi(1)).toBe("2026-09-30");
    expect(xotira.size).toBe(0);
    expect(chaqir).toHaveBeenCalledTimes(1);

    // Sessiya faqat shu yuklash uchun: keyingisida unutiladi.
    expect((await modul()).oxirgiKorilganniOqi(1)).toBeNull();
  });

  it("obuna: shu varaqdagi yozuv ham, boshqa varaqdan `storage` ham xabar beradi; bekor qilingach — yo'q", async () => {
    const { oyna } = oynaQur();
    const { oxirgiKorilganniYoz, yangiliklarObunasi } = await modul();
    const chaqir = vi.fn();
    const bekor = yangiliklarObunasi(chaqir);

    oxirgiKorilganniYoz(1, "2026-09-30");
    oyna.dispatchEvent(new Event("storage"));
    expect(chaqir).toHaveBeenCalledTimes(2);

    bekor();
    oxirgiKorilganniYoz(1, "2026-10-05");
    oyna.dispatchEvent(new Event("storage"));
    expect(chaqir).toHaveBeenCalledTimes(2);
  });
});
