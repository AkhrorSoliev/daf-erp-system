import { OeffentlichesProfilEkrani } from "@/components/student-portal/lernen/reyting/oeffentliches-profil-ekrani";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OeffentlichesProfilEkrani id={Number(id)} />;
}
