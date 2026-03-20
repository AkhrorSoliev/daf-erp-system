import { students } from "@/data/student-model";
import { StudentProfileClient } from "@/components/students/student-profile-client";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = students.find((s) => s.id === id);

  if (!student) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          O&apos;quvchi topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {id} bo&apos;yicha o&apos;quvchi mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StudentProfileClient student={student} />
    </div>
  );
}
