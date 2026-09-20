"use client";

import { BookOpenCheck, CalendarCheck, CheckCircle2, Clock, Target, Users } from "lucide-react";
import { KpiCard } from "@/components/groups/app-activity/activity-ui";
import { formatDavomiylik, foizRangi } from "@/components/groups/app-activity/activity-format";
import { formatNumber } from "@/lib/format-utils";
import type { MarkazKartalari, Norma } from "./types";

/** 2.7 → «2,7» — o'zbekcha kasr belgisi. */
const kasr = (n: number) => String(n).replace(".", ",");

export function DafKpiCards({ k, norma }: { k: MarkazKartalari; norma: Norma }) {
  const akkauntsiz = k.oquvchilar - k.akkauntlar;
  const hechKirmagan = k.akkauntlar - k.birMartaKirganlar;
  const farq = k.ortachaFaolKunHaftada === null ? null : k.ortachaFaolKunHaftada - norma.haftalikKun;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={Users}
        label="Qamrov"
        value={`${formatNumber(k.birMartaKirganlar)} / ${formatNumber(k.oquvchilar)}`}
        hint={`${formatNumber(akkauntsiz)} tasida akkaunt yo'q, ${formatNumber(hechKirmagan)} tasi hech qachon kirmagan`}
        tooltip="Faol o'quvchilardan nechtasi ilovaga hech bo'lmasa bir marta kirgan (butun tarix bo'yicha)."
      />
      <KpiCard
        icon={CheckCircle2}
        label="Normani bajarmoqda"
        value={k.normaFoiz === null ? "—" : `${k.normaFoiz}%`}
        valueClassName={foizRangi(k.normaFoiz)}
        hint={`${formatNumber(k.yashillar)} o'quvchi · haftada ${norma.haftalikKun} faol kun`}
        tooltip={`Yashil holatdagilar: tanlangan davrda kamida ${k.kerakliKun} kun faol bo'lganlar (me'yor — haftasiga ${norma.haftalikKun} kun; o'quvchi keyinroq qo'shilgan bo'lsa chegara mutanosib kamayadi). Faol kun — kuniga ${norma.kunlikDaqiqa} daqiqa o'quv bo'limida yoki ${norma.kunlikSavol} ta savol.`}
      />
      <KpiCard
        icon={CalendarCheck}
        label="O'rtacha faol kun"
        value={k.ortachaFaolKunHaftada === null ? "—" : kasr(k.ortachaFaolKunHaftada)}
        hint={
          farq === null
            ? "haftasiga"
            : farq >= 0
              ? `haftasiga · normadan ${kasr(Math.round(farq * 10) / 10)} kun ko'p`
              : `haftasiga · normadan ${kasr(Math.round(-farq * 10) / 10)} kun kam`
        }
        tooltip="Davrda kirganlar orasida, haftaga keltirilgan. Yangi akkauntlar o'z kuzatilgan kunlariga nisbatan sanaladi."
      />
      <KpiCard
        icon={Clock}
        label="O'rtacha vaqt"
        value={k.ortachaKunlikSoniya === null ? "—" : formatDavomiylik(k.ortachaKunlikSoniya)}
        hint="kuniga, o'quv bo'limida · kirganlar orasida"
        tooltip="Faqat LERNEN bo'limidagi faol vaqt. Radio va boshqa bo'limlar kirmaydi."
      />
      <KpiCard
        icon={Target}
        label="To'g'ri javob"
        value={k.foiz === null ? "—" : `${k.foiz}%`}
        valueClassName={foizRangi(k.foiz)}
        hint={`tugatilgan seanslar bo'yicha · ${formatNumber(k.savollar)} savol`}
        tooltip="Birinchi urinishda to'g'ri topilgan savollar ulushi — tugatilgan seanslar bo'yicha. Tashlab ketilgan seans kirmaydi, shuning uchun guruh tabidan 1–2 % farq qilishi mumkin."
      />
      <KpiCard
        icon={BookOpenCheck}
        label="Tugatilgan darslar"
        value={formatNumber(k.tugatilganDarslar)}
        hint="butun tanlangan davr"
        tooltip="Davrda oxirigacha ishlangan darslar. Qayta tugatilgan dars ham sanaladi. Bu ko'rsatkich ilova faolligi kuzatuvi boshlanishidan oldingi darslarni ham sanaydi, shuning uchun qo'shni kartalardan kengroq davrni qamrashi mumkin."
      />
    </div>
  );
}
