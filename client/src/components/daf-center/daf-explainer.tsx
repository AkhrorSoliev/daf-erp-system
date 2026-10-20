"use client";

import { useT } from "@/i18n/context";
import { formatKunOy } from "@/components/groups/app-activity/activity-format";
import type { Norma } from "./types";

/**
 * Bu sahifadagi raqamlar qanday hisoblanishi. Guruh tabidagi `ActivityExplainer`
 * bu yerda QAYTA ISHLATILMAYDI — u «shug'ullangan kun» ni «mashq yoki 5 daqiqa
 * radio» deb ta'riflaydi, markazda esa radio sanalmaydi (dizayn 3.3-a). Matn
 * normadan o'qiladi, shuning uchun CEO sozlamani o'zgartirsa shu yerda ham
 * darhol yangi raqam turadi.
 */
export function DafExplainer({
  norma,
  kuzatuvBoshi,
}: {
  norma: Norma;
  kuzatuvBoshi: string | null;
}) {
  const t = useT();
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("Raqamlar qanday hisoblanadi")}</summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          <b className="text-foreground">{t("Faol kun")}</b>
          {" — "}
          {t("o'quvchi o'sha kuni o'quv bo'limida kamida {minutes} daqiqa ishlagan yoki tugatilgan seanslarda kamida {questions} ta savolga javob bergan kun. Radio tinglash bunga kirmaydi.", {
            minutes: norma.kunlikDaqiqa,
            questions: norma.kunlikSavol,
          })}
        </p>
        <p>
          <b className="text-foreground">{t("Holat")}</b>
          {" — "}
          {t("haftada {green} kun faol bo'lsa yashil, {yellow} kundan boshlab sariq, kamroq bo'lsa qizil. 30 kunlik davrda talab shunga mutanosib o'sadi. Normani CEO sozlamalarda o'zgartiradi.", {
            green: norma.haftalikKun,
            yellow: norma.sariqKun,
          })}
        </p>
        <p>
          <b className="text-foreground">{t("Ikki xil «kirgan»")}</b>
          {" — "}
          {t("«bir marta bo'lsa ham kirgan» butun tarix bo'yicha, «davr ichida kirgan» esa faqat tanlangan davr bo'yicha. Ilgari kirib, keyin tashlab ketgan o'quvchi «hech qachon kirmagan» emas.")}
        </p>
        <p>
          {t("O'rtachalar davrda kirganlar orasida hisoblanadi.")}{" "}
          {t("«Normani bajarmoqda» foizi barcha faol o'quvchiga nisbatan — akkaunti yo'qlar ham maxrajda turadi.")}{" "}
          {t("«To'g'ri javob» foizi esa boshqacha: uning maxraji — javob berilgan savollar soni, o'quvchilar soni emas.")}
        </p>
        <p>
          <b className="text-foreground">{t("To'g'ri javob")}</b>
          {" — "}
          {t("tugatilgan seanslar bo'yicha. Guruh sahifasidagi foiz urinishlardan hisoblanadi, shuning uchun 1–2 foiz farq qilishi mumkin.")}
        </p>
        <p>
          {kuzatuvBoshi
            ? t("Kuzatuv {date} dan boshlangan — undan oldingi kunlar hech kimga hisoblanmaydi.", { date: formatKunOy(kuzatuvBoshi) })
            : t("Ilova faolligi hali qayd etilmagan.")}
        </p>
      </div>
    </details>
  );
}
