import { redirect } from "next/navigation";

/** Eski bo'lim sahifasi — endi /media ichida (`?bolim=`). Tashqi havolalar uchun qoldirilgan. */
export default async function MediaSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/media?bolim=${encodeURIComponent(id)}`);
}
