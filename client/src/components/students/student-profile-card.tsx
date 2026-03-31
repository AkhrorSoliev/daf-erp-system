"use client";

import { format } from "date-fns";
import { ChevronDown, Clock, CreditCard, Flag, Pencil, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditStudent } from "@/hooks/use-edit-student";
import type { Student } from "@/data/student-model";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import api from "@/lib/api";

function formatBalance(balance: number): string {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (balance < 0) return `-${abs} so'm`;
  return `${abs} so'm`;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  return format(new Date(iso), "dd.MM.yyyy");
}

interface StudentProfileCardProps {
  student: Student;
  commentKey?: number;
  onEnrollClick?: () => void;
}

export function StudentProfileCard({ student, commentKey, onEnrollClick }: StudentProfileCardProps) {
  const { openDrawer } = useEditStudent();
  const [latestComment, setLatestComment] = useState<{
    content: string;
    isTask?: boolean;
    author: { name: string };
    createdAt: string;
  } | null>(null);

  useEffect(() => {
    api.get("/comments/latest", {
      params: { entityType: "Student", entityId: String(student.id) },
    })
      .then(({ data }) => setLatestComment(data || null))
      .catch(() => {});
  }, [student.id, commentKey]);

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AvatarWithPreview src={student.photo} alt={`${student.firstName} ${student.lastName}`}>
          <Avatar className="size-20">
            <AvatarImage src={student.photo ?? undefined} alt={student.firstName} />
            <AvatarFallback className="text-2xl font-semibold">
              {student.firstName[0]}
              {student.lastName[0]}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>

        <div>
          <h2 className="text-xl font-bold">
            {student.firstName} {student.lastName}
          </h2>
          <p className="text-sm text-muted-foreground">(id: {student.id})</p>
        </div>

        <Badge
          className={cn(
            "px-3 py-1 text-sm font-semibold",
            student.balance >= 0
              ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
          )}
        >
          {formatBalance(student.balance)} balans
        </Badge>
      </div>

      {/* Contact info */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Telefon:</span>
          <a
            href={`tel:+998${student.phone}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {formatPhone(student.phone)}
          </a>
        </div>
        {student.date_of_birth && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tug&apos;ilgan sana:</span>
            <span>{formatDate(student.date_of_birth)}</span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-muted-foreground">
            Qo&apos;shilgan sana:
          </span>
          <span>{formatDate(student.createdAt)}</span>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEnrollClick}>
          <UserPlus className="mr-1.5 size-4" />
          {student.groups.length > 0 ? "Guruhni o'zgartirish" : "Guruhga qo'shish"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <CreditCard className="mr-1.5 size-4" />
              To&apos;lov
              <ChevronDown className="ml-1.5 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>To&apos;lov qo&apos;shish</DropdownMenuItem>
            <DropdownMenuItem>To&apos;lov tarixi</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Icon actions */}
      <div className="flex items-center justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => openDrawer(student)}
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

      <Separator />

      {/* So'nggi izoh */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">So&apos;nggi izoh</span>
        </div>
        {latestComment ? (
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
            <p className="text-sm leading-relaxed line-clamp-3">{latestComment.content}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium">{latestComment.author.name}</span>
              <span>&middot;</span>
              <span>{format(new Date(latestComment.createdAt), "dd.MM.yyyy, HH:mm")}</span>
              {latestComment.isTask && (
                <>
                  <span>&middot;</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Topshiriq</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {student.comment || "Izoh mavjud emas"}
          </p>
        )}
      </div>
    </div>
  );
}
