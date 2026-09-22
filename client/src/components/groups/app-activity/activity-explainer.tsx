import { formatKunOy } from "./activity-format";

export function ActivityExplainer({ kuzatuvBoshi }: { kuzatuvBoshi: string | null }) {
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Raqamlar qanday hisoblanadi</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>
          <span className="text-foreground">Faol vaqt</span> — ilova ekranda ochiq va o&apos;quvchi
          oxirgi 2 daqiqada biror harakat qilgan vaqt. Ochiq qoldirilgan tab sanalmaydi.
        </li>
        <li>
          <span className="text-foreground">Radio</span> — ovoz haqiqatan yangragan vaqt. Ekran
          yopiq bo&apos;lsa ham sanaladi, faol vaqtga qo&apos;shilmaydi.
        </li>
        <li>
          <span className="text-foreground">Shug&apos;ullangan kun</span> — kamida bitta mashq javobi
          yoki kamida 5 daqiqa radio. Faqat ilovani ochish sanalmaydi.
        </li>
        <li>
          <span className="text-foreground">Kunlar maxraji</span> — o&apos;quvchi akkaunti yaratilgan
          yoki kuzatuv boshlangan kundan sanaladi.
          {kuzatuvBoshi && ` Kuzatuv ${formatKunOy(kuzatuvBoshi)} dan boshlangan.`}
        </li>
        <li>
          <span className="text-foreground">To&apos;g&apos;ri javob</span> — har bir savol birinchi
          so&apos;ralganda to&apos;g&apos;ri topilgani. Xatodan keyin qayta so&apos;ralgandagi javob bu
          foizga kirmaydi. O&apos;quvchi natija ekranida ko&apos;radigan raqam bilan bir xil ta&apos;rif.
        </li>
        <li>
          <span className="text-foreground">Kurs</span> — darajadagi kurs darslaridan tugatilganlari;
          o&apos;quvchi darajasi guruhnikidan past bo&apos;lsa «Guruhdan orqada» belgisi.
        </li>
      </ul>
    </details>
  );
}
