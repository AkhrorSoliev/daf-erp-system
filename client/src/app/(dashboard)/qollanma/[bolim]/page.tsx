import { notFound } from "next/navigation";
import { bolimlar, bolimTopish } from "@/qollanma/bolimlar";
import { QollanmaBolimSahifasi } from "@/components/qollanma/qollanma-bolim-sahifasi";

export function generateStaticParams() {
  return bolimlar.map((b) => ({ bolim: b.id }));
}

export const dynamicParams = false;

export default async function QollanmaBolimPage({ params }: { params: Promise<{ bolim: string }> }) {
  const { bolim } = await params;
  const yozuv = bolimTopish(bolim);
  if (!yozuv) notFound();
  // icon — funksiya, klient komponentiga uzatib bo'lmaydi.
  return <QollanmaBolimSahifasi bolim={{ id: yozuv.id, nom: yozuv.nom, tavsif: yozuv.tavsif }} />;
}
