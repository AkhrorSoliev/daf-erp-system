"use client";

import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { Screen, StackHeader, FadeIn, Card } from "./lumio";

const FAQ = [
  {
    q: msg("Balansni qanday to'ldiraman?"),
    a: msg("«To'lovlar» bo'limiga kiring, summani tanlang va Payme yoki Click orqali to'lang. Balans bir necha soniyada yangilanadi."),
  },
  {
    q: msg("Davomat qanday belgilanadi?"),
    a: msg("Davomat darsda o'qituvchingiz tomonidan belgilanadi. Uni Bosh sahifada va «Davomat» bo'limida kuzatib borishingiz mumkin."),
  },
  {
    q: msg("Balansim manfiy bo'lsa nima bo'ladi?"),
    a: msg("Manfiy balans qarzdorlikni bildiradi. Darslarni davom ettirish uchun iltimos balansni to'ldiring."),
  },
  {
    q: msg("Jadvalim va davomatim qayerda?"),
    a: msg("Bugungi darslaringiz Bosh sahifada, butun hafta «Jadval» bo'limida. Davomat foizi Bosh sahifada, batafsil tarixi «Davomat» bo'limida."),
  },
  {
    q: msg("Profil rasmini qanday o'zgartiraman?"),
    a: msg("Profil sahifasini oching (telefonda «Ko'proq» ichida, kompyuterda yon menyuning tepasida), rasm ustiga bosing va yangi rasm tanlang."),
  },
];

export function StudentFaqPage() {
  const t = useT();
  return (
    <Screen narrow>
      <StackHeader title={t("FAQ")} backHref="/portal/more" />
      <div className="flex flex-col gap-3">
        {FAQ.map((f, i) => (
          <FadeIn key={i} index={i}>
            <Card className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-ink-900">
                {t(f.q)}
              </h3>
              <p className="text-[15px] font-semibold leading-relaxed text-ink-700">
                {t(f.a)}
              </p>
            </Card>
          </FadeIn>
        ))}
      </div>
    </Screen>
  );
}
