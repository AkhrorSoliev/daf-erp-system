"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditStudent } from "@/hooks/use-edit-student";
import { EditStudentDrawer } from "./edit-student-drawer";
import type { Student } from "@/data/student-model";

export function StudentProfileClient({ student }: { student: Student }) {
  const { openDrawer } = useEditStudent();

  return (
    <>
      <div className="flex items-center gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-muted-foreground">ID: {student.id}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDrawer(student)}
            >
              <Pencil className="mr-2 size-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>O&apos;quvchi ma&apos;lumotlarini tahrirlash</TooltipContent>
        </Tooltip>
      </div>
      <EditStudentDrawer />
    </>
  );
}
