"use client";

import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { TeacherData } from "@/hooks/use-edit-teacher";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface TeacherProfileTabsProps {
  teacher: TeacherData;
}

export function TeacherProfileTabs({ teacher }: TeacherProfileTabsProps) {
  const [firstName = "", ...rest] = teacher.name.split(" ");
  const lastName = rest.join(" ");

  return (
    <Tabs defaultValue="profil" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="profil">Profil</TabsTrigger>
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        <TabsTrigger value="ish-haqi">Ish haqi</TabsTrigger>
      </TabsList>

      {/* Profil */}
      <TabsContent value="profil">
        <div className="rounded-md border p-4 text-sm space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Ism:</span>{" "}
              <span className="font-medium">{firstName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Familiya:</span>{" "}
              <span className="font-medium">{lastName || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Jinsi:</span>{" "}
              <span className="font-medium">
                {teacher.gender === "MALE"
                  ? "Erkak"
                  : teacher.gender === "FEMALE"
                    ? "Ayol"
                    : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Telefon:</span>{" "}
              <span className="font-medium">
                {teacher.phone
                  ? `+998 ${teacher.phone.slice(0, 2)} ${teacher.phone.slice(2, 5)} ${teacher.phone.slice(5, 7)} ${teacher.phone.slice(7, 9)}`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Login:</span>{" "}
              <span className="font-medium">{teacher.login ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Holati:</span>{" "}
              <Badge
                variant={teacher.isActive ? "default" : "destructive"}
                className="text-xs"
              >
                {teacher.isActive ? "Faol" : "Nofaol"}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Kompaniya:</span>{" "}
              <span className="font-medium">{teacher.company.name}</span>
            </div>
            {teacher.branches.length > 0 && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Filiallar:</span>{" "}
                {teacher.branches.map((b) => (
                  <Badge key={b.id} variant="outline" className="ml-1 text-xs">
                    {b.name}
                  </Badge>
                ))}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Qo&apos;shilgan:</span>{" "}
              <span className="font-medium">
                {format(new Date(teacher.createdAt), "dd.MM.yyyy")}
              </span>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Guruhlar */}
      <TabsContent value="guruhlar">
        <EmptyState message="Guruhlar hali ulanmagan" />
      </TabsContent>

      {/* Ish haqi */}
      <TabsContent value="ish-haqi">
        <EmptyState message="Ish haqi ma'lumotlari mavjud emas" />
      </TabsContent>
    </Tabs>
  );
}
