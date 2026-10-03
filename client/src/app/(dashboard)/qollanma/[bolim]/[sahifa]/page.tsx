import { notFound } from "next/navigation";
import { bolimTopish } from "@/qollanma/bolimlar";
import { sahifalar, sahifaTopish } from "@/qollanma/sahifalar";
import { QollanmaSahifaBosh } from "@/components/qollanma/qollanma-sahifa-bosh";

export function generateStaticParams() {
  return sahifalar.map((s) => ({ bolim: s.bolim, sahifa: s.sahifa }));
}

export const dynamicParams = false;

export default async function QollanmaSahifaPage({
  params,
}: {
  params: Promise<{ bolim: string; sahifa: string }>;
}) {
  const { bolim, sahifa } = await params;
  const yozuv = sahifaTopish(bolim, sahifa);
  const bolimYozuv = bolimTopish(bolim);
  if (!yozuv || !bolimYozuv) notFound();

  const { default: Kontent } = await import(`@/qollanma/kontent/${bolim}/${sahifa}.mdx`);

  return (
    <article className="min-w-0 pb-16">
      <QollanmaSahifaBosh sahifa={yozuv} bolim={bolimYozuv} />
      <Kontent />
    </article>
  );
}
