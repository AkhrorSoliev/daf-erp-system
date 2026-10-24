"use client";

import { useT } from "@/i18n/context";
import { formatKunOy } from "./activity-format";

export function ActivityExplainer({ kuzatuvBoshi }: { kuzatuvBoshi: string | null }) {
  const t = useT();
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("Raqamlar qanday hisoblanadi")}</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>
          <span className="text-foreground">{t("Faol vaqt")}</span>
          {" — "}
          {t("ilova ekranda ochiq va o'quvchi oxirgi 2 daqiqada biror harakat qilgan vaqt. Ochiq qoldirilgan tab sanalmaydi.")}
        </li>
        <li>
          <span className="text-foreground">{t("Radio")}</span>
          {" — "}
          {t("ovoz haqiqatan yangragan vaqt. Ekran yopiq bo'lsa ham sanaladi, faol vaqtga qo'shilmaydi.")}
        </li>
        <li>
          <span className="text-foreground">{t("Shug'ullangan kun")}</span>
          {" — "}
          {t("kamida bitta mashq javobi yoki kamida 5 daqiqa radio. Faqat ilovani ochish sanalmaydi.")}
        </li>
        <li>
          <span className="text-foreground">{t("Kunlar maxraji")}</span>
          {" — "}
          {t("o'quvchi akkaunti yaratilgan yoki kuzatuv boshlangan kundan sanaladi.")}
          {kuzatuvBoshi && ` ${t("Kuzatuv {date} dan boshlangan.", { date: formatKunOy(kuzatuvBoshi) })}`}
        </li>
        <li>
          <span className="text-foreground">{t("To'g'ri javob")}</span>
          {" — "}
          {t("har bir savol birinchi so'ralganda to'g'ri topilgani. Xatodan keyin qayta so'ralgandagi javob bu foizga kirmaydi. O'quvchi natija ekranida ko'radigan raqam bilan bir xil ta'rif.")}
        </li>
        <li>
          <span className="text-foreground">{t("Kurs")}</span>
          {" — "}
          {t("darajadagi kurs darslaridan tugatilganlari; o'quvchi darajasi guruhnikidan past bo'lsa «Guruhdan orqada» belgisi.")}
        </li>
      </ul>
    </details>
  );
}
