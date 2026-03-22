import { StudentsClient } from "@/components/students/students-client";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          O&apos;quvchilar
        </h1>
        <p className="text-muted-foreground">
          Barcha o&apos;quvchilar ro&apos;yxati
        </p>
      </div>
      <StudentsClient />
    </div>
  );
}
