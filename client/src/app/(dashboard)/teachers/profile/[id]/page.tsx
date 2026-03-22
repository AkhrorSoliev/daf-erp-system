import { teachers } from "@/data/teacher-model";

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = teachers.find((t) => t.id === id);

  if (!teacher) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          O&apos;qituvchi topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {id} bo&apos;yicha o&apos;qituvchi mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {teacher.firstName} {teacher.lastName}
        </h1>
        <p className="text-muted-foreground">ID: {teacher.id}</p>
      </div>
    </div>
  );
}
