"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Pencil, Phone, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import { useAuth } from "@/hooks/use-auth";
import { formatPhone } from "@/lib/format-utils";
import { SalaryDueCard } from "@/components/shared/salary-due-card";

interface TeacherProfileCardProps {
  teacher: TeacherData;
}

export function TeacherProfileCard({ teacher }: TeacherProfileCardProps) {
  const { openDrawer } = useEditTeacher();
  const router = useRouter();
  const authUser = useAuth((s) => s.user);
  const canManageTeachers = authUser?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const handleDelete = () => {
    router.push("/teachers");
    toast.success("O'qituvchi muvaffaqiyatli o'chirildi");
    api.delete(`/teachers/${teacher.id}`).catch(() => {
      toast.error("O'chirishda xatolik yuz berdi");
    });
  };

  const fullName = `${teacher.firstName} ${teacher.lastName}`;
  const initials = `${teacher.firstName[0] ?? ''}${teacher.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AvatarWithPreview src={teacher.photo} alt={fullName}>
          <Avatar className="size-20">
            <AvatarImage src={teacher.photo ?? undefined} alt={fullName} />
            <AvatarFallback className="text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>

        <div>
          <h2 className="text-xl font-bold">{fullName}</h2>
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

      {/* Salary due — CEO and Branch Director only */}
      {canManageTeachers && (
        <>
          <SalaryDueCard userId={teacher.id} />

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

            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-destructive hover:text-destructive"
                      disabled={false}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent>O&apos;chirish</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>O&apos;qituvchini o&apos;chirish</AlertDialogTitle>
                  <AlertDialogDescription>
                    &quot;{fullName}&quot; arxivga o&apos;tkaziladi. Keyinchalik
                    arxivdan tiklash mumkin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    O&apos;chirish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}
