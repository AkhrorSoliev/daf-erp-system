import { Screen, StackHeader, FadeIn, Card } from "./lumio";

const FAQ = [
  {
    q: "Balansni qanday to'ldiraman?",
    a: "«To'lovlar» bo'limiga kiring, summani tanlang va Payme yoki Click orqali to'lang. Balans bir necha soniyada yangilanadi.",
  },
  {
    q: "Davomat qanday belgilanadi?",
    a: "Davomat darsda o'qituvchingiz tomonidan belgilanadi. Uni Asosiy sahifada va «Davomat» bo'limida kuzatib borishingiz mumkin.",
  },
  {
    q: "Balansim manfiy bo'lsa nima bo'ladi?",
    a: "Manfiy balans qarzdorlikni bildiradi. Darslarni davom ettirish uchun iltimos balansni to'ldiring.",
  },
  {
    q: "Jadvalim va davomatim qayerda?",
    a: "Bugungi darslaringiz Asosiy sahifada, butun hafta «Jadval» bo'limida. Davomat foizi Asosiy sahifada, batafsil tarixi «Davomat» bo'limida.",
  },
  {
    q: "Profil rasmini qanday o'zgartiraman?",
    a: "Profil sahifasini oching (telefonda «Ko'proq» ichida, kompyuterda yon menyuning tepasida), rasm ustiga bosing va yangi rasm tanlang.",
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
