import { notFound } from "next/navigation";
import { bolimlar, bolimTopish } from "@/qollanma/bolimlar";
import { sahifalar } from "@/qollanma/sahifalar";
import { QollanmaBolimSahifasi } from "@/components/qollanma/qollanma-bolim-sahifasi";

// Hali sahifasi yo'q bo'lim 404 beradi — «rolingiz uchun sahifa yo'q» deb aldamaydi.
export function generateStaticParams() {
  return bolimlar.filter((b) => sahifalar.some((s) => s.bolim === b.id)).map((b) => ({ bolim: b.id }));
}

export const dynamicParams = false;

export default async function QollanmaBolimPage({ params }: { params: Promise<{ bolim: string }> }) {
  const { bolim } = await params;
  const yozuv = bolimTopish(bolim);
  if (!yozuv) notFound();
  // icon — funksiya, klient komponentiga uzatib bo'lmaydi.
  return <QollanmaBolimSahifasi bolim={{ id: yozuv.id, nom: yozuv.nom, tavsif: yozuv.tavsif }} />;
}
