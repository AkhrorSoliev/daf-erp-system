"use client";

import { format } from "date-fns";
import { Pencil, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";

function formatPhone(phone: string): string {
  if (phone.length === 9) {
    return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
  }
  return phone;
}

interface TeacherProfileCardProps {
  teacher: TeacherData;
}

export function TeacherProfileCard({ teacher }: TeacherProfileCardProps) {
  const { openDrawer } = useEditTeacher();

  const initials = teacher.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-20">
          <AvatarImage src={teacher.photo ?? undefined} alt={teacher.name} />
          <AvatarFallback className="text-2xl font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="text-xl font-bold">{teacher.name}</h2>
          <p className="text-sm text-muted-foreground">(id: {teacher.id})</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {teacher.roles.map((role) => (
            <Badge
              key={role.id}
              className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
            >
              {role.name}
            </Badge>
          ))}
          {!teacher.isActive && (
            <Badge variant="destructive">Nofaol</Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm">
        {teacher.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Telefon:</span>
            <a
              href={`tel:+998${teacher.phone}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {formatPhone(teacher.phone)}
            </a>
          </div>
        )}

        {teacher.gender && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Jinsi:</span>
            <span>{teacher.gender === "MALE" ? "Erkak" : "Ayol"}</span>
          </div>
        )}

        {teacher.login && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Login:</span>
            <span className="font-medium">{teacher.login}</span>
          </div>
        )}

        {teacher.branches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Filiallar:</span>
            {teacher.branches.map((b) => (
              <Badge key={b.id} variant="outline" className="text-xs">
                {b.name}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Qo&apos;shilgan:</span>
          <span>{format(new Date(teacher.createdAt), "dd.MM.yyyy")}</span>
        </div>
      </div>

      <Separator />

      {/* Balance */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Balans</p>
        <p
          className={`text-lg font-bold ${teacher.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {teacher.balance.toLocaleString("en-US")} so&apos;m
        </p>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => openDrawer(teacher)}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tahrirlash</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
