"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, UserMinus, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import toast from "react-hot-toast";

export interface GroupStudent {
  enrollmentId: string;
  enrolledAt: string;
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  balance: number;
  isActive: boolean;
}


function formatBalance(balance: number) {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = balance < 0 ? "-" : "";
  return `${sign}${abs} so'm`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return phone;
}

interface GroupStudentsTableProps {
  students: GroupStudent[];
  onStudentDeleted?: (id: number) => void;
}

export function GroupStudentsTable({ students, onStudentDeleted }: GroupStudentsTableProps) {
  const user = useAuth((s) => s.user);
  const canManage =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const [removeTarget, setRemoveTarget] = useState<GroupStudent | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!removeTarget || !removeReason.trim()) return;
    setRemoving(true);
    const { id, enrollmentId } = removeTarget;
    setRemoveTarget(null);
    onStudentDeleted?.(id);
    try {
      await api.delete(`/students/${id}/enroll/${enrollmentId}`, {
        data: { reason: removeReason.trim() },
      });
      toast.success("O'quvchi guruhdan chiqarildi");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Xatolik yuz berdi");
    } finally {
      setRemoving(false);
      setRemoveReason("");
    }
  };

  if (students.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          Bu guruhda o&apos;quvchilar yo&apos;q
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 border-r">#</TableHead>
            <TableHead className="w-10">Rasm</TableHead>
            <TableHead className="min-w-30">Ism familiya</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">
              Telefon
            </TableHead>
            <TableHead className="min-w-28 text-right">Balans</TableHead>
            <TableHead className="hidden sm:table-cell">Holat</TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow
              key={student.enrollmentId}
              className="relative cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="border-r text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell>
                <AvatarWithPreview src={student.photo} alt={`${student.firstName} ${student.lastName}`}>
                  <Avatar className="size-8">
                    <AvatarImage
                      src={student.photo ?? undefined}
                      alt={`${student.firstName} ${student.lastName}`}
                    />
                    <AvatarFallback className="text-xs">
                      {student.firstName[0]}
                      {student.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                </AvatarWithPreview>
              </TableCell>
              <TableCell className="font-medium">
                <Link href={`/students/profile/${student.id}`} className="absolute inset-0" />
                {student.firstName} {student.lastName}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {formatPhone(student.phone)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium",
                  student.balance < 0
                    ? "text-destructive"
                    : "text-green-600 dark:text-green-400"
                )}
              >
                {formatBalance(student.balance)}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant={student.isActive ? "default" : "secondary"}>
                  {student.isActive ? "Faol" : "Muzlatilgan"}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell className="relative z-10" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Amallar</span>
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Amallar</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setRemoveReason("");
                          setRemoveTarget(student);
                        }}
                      >
                        <UserMinus className="mr-2 size-4" />
                        Guruhdan chiqarish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guruhdan chiqarishni tasdiqlang</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.firstName} {removeTarget?.lastName}</strong> guruhdan chiqarilsinmi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Textarea
              placeholder="Sabab yozing (majburiy)..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing || !removeReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Chiqarilmoqda..." : "Chiqarish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
