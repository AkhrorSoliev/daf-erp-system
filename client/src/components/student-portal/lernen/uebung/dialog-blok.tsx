"use client";

import { cn } from "@/lib/utils";

/** Bitta suhbat qatori — `ajratDialogQatorlari` ning natijasi. */
export interface DialogQatori {
  /** Ikki nuqta topilmasa — `null`, butun satr `matn`ga tushadi. */
  sprecher: string | null;
  matn: string;
  /** `matn` bo'sh joy belgisini (`___`) o'z ichiga oladimi. */
  boshMi: boolean;
  /** Gapiruvchi yonidagi sahna izohi: `Mia (boshqa xonadan): ...` dagi qavs. */
  izoh?: string;
  /** Butun qator qavsdagi sahna izohi: `(Ertalab. Jonas oshxonada.)`. */
  sahna?: true;
}

/**
 * Serverdan kelgan `Sprecher: matn` satrlarini (bo'sh joyda `___`)
 * `DialogBlok` chizadigan shaklga ajratadi.
 *
 * Har satrda FAQAT birinchi ikki nuqtagacha bo'lgan qism gapiruvchi nomi
 * — undan keyingi matnda yana ikki nuqta uchrashi mumkin (masalan soat:
 * "Es ist 10:30 Uhr"), va u matnning bir qismi bo'lib qolishi kerak.
 *
 * Ikki nuqta topilmasa butun satr matn sifatida qaytadi (`sprecher: null`)
 * — server bu shaklni o'zgartirsa ham ekran buzilmasin (brief §5).
 * Qavsdagi qator — sahna izohi (`sahna`), nom yonidagi qavs — satr izohi (`izoh`).
 */
export function ajratDialogQatorlari(matn: string): DialogQatori[] {
  return matn.split("\n").map((qator): DialogQatori => {
    const nuqtaIndex = qator.indexOf(":");
    if (nuqtaIndex === -1) {
      const sahna = /^\((.+)\)$/.exec(qator.trim());
      if (sahna) return { sprecher: null, matn: sahna[1], boshMi: false, sahna: true };
      return { sprecher: null, matn: qator, boshMi: qator.includes("___") };
    }
    const kim = qator.slice(0, nuqtaIndex).trim();
    const matnQismi = qator.slice(nuqtaIndex + 1).trim();
    const boshMi = matnQismi.includes("___");
    const izohli = /^(.+?)\s*\(([^)]+)\)$/.exec(kim);
    return izohli
      ? { sprecher: izohli[1], izoh: izohli[2], matn: matnQismi, boshMi }
      : { sprecher: kim, matn: matnQismi, boshMi };
  });
}

export interface DialogBlokProps {
  /** Serverdan kelgan tayyor suhbat matni, satrlar `\n` bilan ajratilgan. */
  matn: string;
}

/**
 * `DIALOG_LUECKE` savolida savol matni o'rniga butun suhbatni chizadi.
 *
 * Server `prompt`ni TAYYOR satr qilib yuboradi — bu komponent uni faqat
 * CHIROYLI chizadi, qaytadan qurmaydi (dizayn qoidasi, brief §5).
 */
export function DialogBlok({ matn }: DialogBlokProps) {
  const qatorlar = ajratDialogQatorlari(matn);

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      {qatorlar.map((qator, i) => (
        <p
          key={i}
          className={cn(
            "text-base leading-relaxed",
            // Bo'sh joy — o'quvchi qayerni to'ldirayotganini darrov ko'rishi
            // uchun ajratib ko'rsatiladi (bg-tint + ramka).
            qator.boshMi && "-mx-2 rounded-lg border border-dashed border-coral-500 bg-tint px-2 py-1",
          )}
        >
          {qator.sprecher != null ? (
            <span className="font-semibold text-ink-500">
              {qator.sprecher}
              {qator.izoh ? <span className="font-normal italic text-ink-400"> ({qator.izoh})</span> : null}
              {": "}
            </span>
          ) : null}
          <span
            className={cn(
              "text-ink-900",
              qator.sahna && "text-sm italic text-ink-500",
              qator.boshMi && "font-semibold text-coral-500",
            )}
          >
            {qator.matn}
          </span>
        </p>
      ))}
    </div>
  );
}
