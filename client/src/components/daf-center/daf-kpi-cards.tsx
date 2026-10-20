"use client";

import { BookOpenCheck, CalendarCheck, CheckCircle2, Clock, Target, Users } from "lucide-react";
import { useT } from "@/i18n/context";
import { KpiCard } from "@/components/groups/app-activity/activity-ui";
import { formatDavomiylik, foizRangi } from "@/components/groups/app-activity/activity-format";
import { formatNumber } from "@/lib/format-utils";
import type { MarkazKartalari, Norma } from "./types";

/** 2.7 → «2,7» — o'zbekcha kasr belgisi. */
const kasr = (n: number) => String(n).replace(".", ",");

export function DafKpiCards({ k, norma }: { k: MarkazKartalari; norma: Norma }) {
  const t = useT();
  const akkauntsiz = k.oquvchilar - k.akkauntlar;
  const hechKirmagan = k.akkauntlar - k.birMartaKirganlar;
  const farq = k.ortachaFaolKunHaftada === null ? null : k.ortachaFaolKunHaftada - norma.haftalikKun;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={Users}
        label={t("Qamrov")}
        value={`${formatNumber(k.birMartaKirganlar)} / ${formatNumber(k.oquvchilar)}`}
        hint={t("{noAccount} tasida akkaunt yo'q, {never} tasi hech qachon kirmagan", {
          noAccount: formatNumber(akkauntsiz),
          never: formatNumber(hechKirmagan),
        })}
        tooltip={t("Faol o'quvchilardan nechtasi ilovaga hech bo'lmasa bir marta kirgan (butun tarix bo'yicha).")}
      />
      <KpiCard
        icon={CheckCircle2}
        label={t("Normani bajarmoqda")}
        value={k.normaFoiz === null ? "—" : `${k.normaFoiz}%`}
        valueClassName={foizRangi(k.normaFoiz)}
        hint={t("{n} o'quvchi · haftada {days} faol kun", { n: formatNumber(k.yashillar), days: norma.haftalikKun })}
        tooltip={t("Yashil holatdagilar: tanlangan davrda kamida {needed} kun faol bo'lganlar (me'yor — haftasiga {days} kun; o'quvchi keyinroq qo'shilgan bo'lsa chegara mutanosib kamayadi). Faol kun — kuniga {minutes} daqiqa o'quv bo'limida yoki {questions} ta savol.", {
          needed: k.kerakliKun,
          days: norma.haftalikKun,
          minutes: norma.kunlikDaqiqa,
          questions: norma.kunlikSavol,
        })}
      />
      <KpiCard
        icon={CalendarCheck}
        label={t("O'rtacha faol kun")}
        value={k.ortachaFaolKunHaftada === null ? "—" : kasr(k.ortachaFaolKunHaftada)}
        hint={
          farq === null
            ? t("haftasiga")
            : farq >= 0
              ? t("haftasiga · normadan {n} kun ko'p", { n: kasr(Math.round(farq * 10) / 10) })
              : t("haftasiga · normadan {n} kun kam", { n: kasr(Math.round(-farq * 10) / 10) })
        }
        tooltip={t("Davrda kirganlar orasida, haftaga keltirilgan. Yangi akkauntlar o'z kuzatilgan kunlariga nisbatan sanaladi.")}
      />
      <KpiCard
        icon={Clock}
        label={t("O'rtacha vaqt")}
        value={k.ortachaKunlikSoniya === null ? "—" : formatDavomiylik(k.ortachaKunlikSoniya, t)}
        hint={t("kuniga, o'quv bo'limida · kirganlar orasida")}
        tooltip={t("Faqat LERNEN bo'limidagi faol vaqt. Radio va boshqa bo'limlar kirmaydi.")}
      />
      <KpiCard
        icon={Target}
        label={t("To'g'ri javob")}
        value={k.foiz === null ? "—" : `${k.foiz}%`}
        valueClassName={foizRangi(k.foiz)}
        hint={t("tugatilgan seanslar bo'yicha · {n} savol", { n: formatNumber(k.savollar) })}
        tooltip={t("Birinchi urinishda to'g'ri topilgan savollar ulushi — tugatilgan seanslar bo'yicha. Tashlab ketilgan seans kirmaydi, shuning uchun guruh tabidan 1–2 % farq qilishi mumkin.")}
      />
      <KpiCard
        icon={BookOpenCheck}
        label={t("Tugatilgan darslar")}
        value={formatNumber(k.tugatilganDarslar)}
        hint={t("butun tanlangan davr")}
        tooltip={t("Davrda oxirigacha ishlangan darslar. Qayta tugatilgan dars ham sanaladi. Bu ko'rsatkich ilova faolligi kuzatuvi boshlanishidan oldingi darslarni ham sanaydi, shuning uchun qo'shni kartalardan kengroq davrni qamrashi mumkin.")}
      />
    </div>
  );
}
