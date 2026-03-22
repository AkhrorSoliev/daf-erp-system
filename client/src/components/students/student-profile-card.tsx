"use client";

import { format } from "date-fns";
import { ChevronDown, Clock, CreditCard, Flag, Pencil, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function formatBalance(balance: number): string {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (balance < 0) return `-${abs} so'm`;
  return `${abs} so'm`;
}

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

interface StudentProfileCardProps {
  student: Student;
}

export function StudentProfileCard({ student }: StudentProfileCardProps) {
  const { openDrawer } = useEditStudent();

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-20">
          <AvatarImage src={student.avatar} alt={student.firstName} />
          <AvatarFallback className="text-2xl font-semibold">
            {student.firstName[0]}
            {student.lastName[0]}
          </AvatarFallback>
        </Avatar>

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
            href={`tel:${student.phone}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {formatPhone(student.phone)}
          </a>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-muted-foreground">
            Talaba qo&apos;shilgan sana:
          </span>
          <span>{formatDate(student.registeredAt)}</span>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          <UserPlus className="mr-1.5 size-4" />
          Guruhga qo&apos;shish
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

      {/* Eslatma */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Eslatma</span>
        </div>
        <p className="text-sm text-muted-foreground italic">
          Eslatma mavjud emas
        </p>
      </div>
    </div>
  );
}
