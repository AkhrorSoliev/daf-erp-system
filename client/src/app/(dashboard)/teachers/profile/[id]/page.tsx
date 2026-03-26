export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // TODO: API dan o'qituvchi ma'lumotlarini olish
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        O&apos;qituvchi topilmadi
      </h1>
      <p className="text-muted-foreground">
        ID: {id} — API hali ulanmagan
      </p>
    </div>
  );
}
