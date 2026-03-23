"use client";

import { format } from "date-fns";
import { AlertTriangle, Calendar, GraduationCap, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { Teacher, TeacherGroup } from "@/data/teacher-model";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return format(new Date(iso), "dd.MM.yyyy");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

const statusConfig: Record<
  TeacherGroup["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Faol",
    className:
      "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  completed: {
    label: "Tugallangan",
    className:
      "bg-gray-100 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
  },
  upcoming: {
    label: "Rejalashtirilgan",
    className:
      "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

function GroupCard({ group }: { group: TeacherGroup }) {
  const status = statusConfig[group.status];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{group.name}</h4>
        <Badge className={cn("text-xs", status.className)}>
          {status.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5" />
          <span>Daraja: {group.level}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          <span>{group.studentCount} ta talaba</span>
        </div>
        <div className="flex items-center gap-1.5 col-span-2">
          <Calendar className="size-3.5" />
          <span>{group.schedule}</span>
        </div>
      </div>
    </div>
  );
}

interface TeacherProfileTabsProps {
  teacher: Teacher;
}

export function TeacherProfileTabs({ teacher }: TeacherProfileTabsProps) {
  const hasGroups = teacher.groups.length > 0;

  return (
    <Tabs defaultValue="profil" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="profil">Profil</TabsTrigger>
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
        <TabsTrigger value="ish-haqi">Ish haqi</TabsTrigger>
      </TabsList>

      {/* Profil */}
      <TabsContent value="profil">
        <div className="rounded-md border p-4 text-sm space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Ism:</span>{" "}
              <span className="font-medium">{teacher.firstName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Familiya:</span>{" "}
              <span className="font-medium">{teacher.lastName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Jinsi:</span>{" "}
              <span className="font-medium">
                {teacher.gender === "male" ? "Erkak" : "Ayol"}
              </span>
            </div>
            {teacher.specialization && (
              <div>
                <span className="text-muted-foreground">Mutaxassislik:</span>{" "}
                <span className="font-medium">{teacher.specialization}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Guruhlar soni:</span>{" "}
              <span className="font-medium">{teacher.groups.length}</span>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Guruhlar */}
      <TabsContent value="guruhlar">
        {!hasGroups && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            O&apos;qituvchi faol guruhga qo&apos;shilmagan!
          </div>
        )}

        {hasGroups ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {teacher.groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState message="Guruhlar mavjud emas" />
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {!teacher.createdBy ? (
          <EmptyState message="Tarix mavjud emas" />
        ) : (
          <div className="rounded-md border p-4 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Qo&apos;shilgan:</span>{" "}
              {teacher.createdBy.by}
            </p>
            <p>
              <span className="text-muted-foreground">Sana:</span>{" "}
              {formatDate(teacher.createdBy.at)}
            </p>
          </div>
        )}
      </TabsContent>

      {/* Ish haqi */}
      <TabsContent value="ish-haqi">
        <EmptyState message="Ish haqi ma'lumotlari mavjud emas" />
      </TabsContent>
    </Tabs>
  );
}
