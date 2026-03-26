"use client";

import { format } from "date-fns";
import { Clock, Pencil, Phone, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditTeacher } from "@/hooks/use-edit-teacher";
import type { Teacher } from "@/data/teacher-model";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  return format(new Date(iso), "dd.MM.yyyy");
}

interface TeacherProfileCardProps {
  teacher: Teacher;
}

export function TeacherProfileCard({ teacher }: TeacherProfileCardProps) {
  const { openDrawer } = useEditTeacher();

  const activeGroups = teacher.groups.filter((g) => g.status === "active").length;

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-20">
          <AvatarImage src={teacher.avatar} alt={teacher.firstName} />
          <AvatarFallback className="text-2xl font-semibold">
            {teacher.firstName[0]}
            {teacher.lastName[0]}
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="text-xl font-bold">
            {teacher.firstName} {teacher.lastName}
          </h2>
          <p className="text-sm text-muted-foreground">(id: {teacher.id})</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
            Teacher
          </Badge>
          {teacher.specialization && (
            <Badge variant="outline">{teacher.specialization}</Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Telefon:</span>
          <a
            href={`tel:${teacher.phone}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {formatPhone(teacher.phone)}
          </a>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Guruhlar:</span>
          <span className="font-medium">
            {teacher.groups.length > 0
              ? `${teacher.groups.length} ta (${activeGroups} faol)`
              : "Yo'q"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Jinsi:</span>
          <span>{teacher.gender === "male" ? "Erkak" : "Ayol"}</span>
        </div>

        {teacher.createdBy && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Qo&apos;shilgan:</span>
            <span>{formatDate(teacher.createdBy.at)}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Icon actions */}
      <div className="flex items-center justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => openDrawer(teacher as unknown as import("@/hooks/use-edit-teacher").TeacherData)}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tahrirlash</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>O&apos;chirish</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0">
              <Clock className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tarix</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
