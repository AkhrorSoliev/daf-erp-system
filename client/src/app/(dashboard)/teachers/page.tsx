import { TeachersClient } from "@/components/teachers/teachers-client";

export default function TeachersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
          O&apos;qituvchilar
        </h1>
        <p className="text-muted-foreground">Barcha o&apos;qituvchilar ro&apos;yxati</p>
      </div>
      <TeachersClient />
    </div>
  );
}
