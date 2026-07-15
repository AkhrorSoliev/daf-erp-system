import { Screen, StackHeader, FadeIn, Card } from "./lumio";

const FAQ = [
  {
    q: "Balansni qanday to'ldiraman?",
    a: "Ko'proq → To'lovlar bo'limiga kiring, summani tanlang va Payme yoki Click orqali to'lang. Balans bir necha soniyada yangilanadi.",
  },
  {
    q: "Davomat qanday belgilanadi?",
    a: "Darsga kelganingizda Asosiy sahifadagi «QR bilan belgilash» tugmasini bosib, dars QR kodini skanerlang.",
  },
  {
    q: "Balansim manfiy bo'lsa nima bo'ladi?",
    a: "Manfiy balans qarzdorlikni bildiradi. Darslarni davom ettirish uchun iltimos balansni to'ldiring.",
  },
  {
    q: "Jadvalim va davomatim qayerda?",
    a: "Asosiy sahifada balans, bugungi darslar va davomat ko'rsatkichlari jamlangan.",
  },
  {
    q: "Profil rasmini qanday o'zgartiraman?",
    a: "Ko'proq → Profil bo'limiga kiring, rasm ustiga bosing va galereya yoki kameradan rasm tanlang.",
  },
];

export function StudentFaqPage() {
  return (
    <Screen>
      <StackHeader title="FAQ" backHref="/portal/more" />
      <div className="flex flex-col gap-3">
        {FAQ.map((f, i) => (
          <FadeIn key={i} index={i}>
            <Card className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-ink-900">
                {f.q}
              </h3>
              <p className="text-[15px] font-semibold leading-relaxed text-ink-700">
                {f.a}
              </p>
            </Card>
          </FadeIn>
        ))}
      </div>
    </Screen>
  );
}
