"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import api from "@/lib/api";
import { useT } from "@/i18n/context";

interface CourseRowActionsProps {
  course: Course;
  onDeleted?: (id: string) => void;
}

export function CourseRowActions({ course, onDeleted }: CourseRowActionsProps) {
  const t = useT();
  const { openDrawer } = useEditCourse();

  const handleDelete = async () => {
    try {
      await api.delete(`/courses/${course.id}`);
      toast.success(t("Kurs muvaffaqiyatli o'chirildi"));
      onDeleted?.(course.id);
    } catch {
      toast.error(t("Kursni o'chirishda xatolik yuz berdi"));
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">{t("Amallar")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("Amallar")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openDrawer(course)}>
          <Pencil className="mr-2 size-4" />
          {t("Tahrirlash")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 size-4" />
          {t("O'chirish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
