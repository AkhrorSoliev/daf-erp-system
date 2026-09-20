"use client";

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
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Raqamlar qanday hisoblanadi</summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          <b className="text-foreground">Faol kun</b> — o&apos;quvchi o&apos;sha kuni o&apos;quv
          bo&apos;limida kamida <b className="text-foreground">{norma.kunlikDaqiqa} daqiqa</b>{" "}
          ishlagan yoki tugatilgan seanslarda kamida{" "}
          <b className="text-foreground">{norma.kunlikSavol} ta</b> savolga javob bergan kun. Radio
          tinglash bunga kirmaydi.
        </p>
        <p>
          <b className="text-foreground">Holat</b> — haftada{" "}
          <b className="text-foreground">{norma.haftalikKun} kun</b> faol bo&apos;lsa yashil,{" "}
          <b className="text-foreground">{norma.sariqKun} kundan</b> boshlab sariq, kamroq
          bo&apos;lsa qizil. 30 kunlik davrda talab shunga mutanosib o&apos;sadi. Normani CEO
          sozlamalarda o&apos;zgartiradi.
        </p>
        <p>
          <b className="text-foreground">Ikki xil «kirgan»</b> — «bir marta bo&apos;lsa ham kirgan»
          butun tarix bo&apos;yicha, «davr ichida kirgan» esa faqat tanlangan davr bo&apos;yicha.
          Ilgari kirib, keyin tashlab ketgan o&apos;quvchi «hech qachon kirmagan» emas.
        </p>
        <p>
          <b className="text-foreground">O&apos;rtachalar</b> davrda kirganlar orasida hisoblanadi,{" "}
          <b className="text-foreground">foizlar</b> esa barcha faol o&apos;quvchiga nisbatan —
          akkaunti yo&apos;qlar ham maxrajda turadi.
        </p>
        <p>
          <b className="text-foreground">To&apos;g&apos;ri javob</b> — tugatilgan seanslar
          bo&apos;yicha. Guruh sahifasidagi foiz urinishlardan hisoblanadi, shuning uchun 1–2 foiz
          farq qilishi mumkin.
        </p>
        <p>
          {kuzatuvBoshi
            ? `Kuzatuv ${formatKunOy(kuzatuvBoshi)} dan boshlangan — undan oldingi kunlar hech kimga hisoblanmaydi.`
            : "Ilova faolligi hali qayd etilmagan."}
        </p>
      </div>
    </details>
  );
}
