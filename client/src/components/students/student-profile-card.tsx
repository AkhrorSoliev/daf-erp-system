"use client";

import { format } from "date-fns";
import { Archive, ChevronDown, Clock, CreditCard, Flag, Pencil, RefreshCw, Trash2, UserPlus } from "lucide-react";
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
import { StudentStatusBadge } from "./student-status-badge";
import { UnusedDepartureLessonsDialog } from "./unused-departure-lessons-dialog";
import { StudentDebtOrigin } from "./student-debt-origin";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
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
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEditStudent } from "@/hooks/use-edit-student";
import { useCan } from "@/hooks/use-permissions";
import type { Student } from "@/data/student-model";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format-utils";
import { ageFromStoredDate } from "@/lib/age";
import { PhoneProofBadge, TelegramBotBadge } from "./student-contact-badges";
import { studentPhoneRows } from "./student-phone-rows";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import toast from "react-hot-toast";

// `unit` is the translated «so'm»; the comma-grouped figure keeps its format.
function formatBalance(balance: number, unit: string): string {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (balance < 0) return `-${abs} ${unit}`;
  return `${abs} ${unit}`;
}

function formatDate(iso: string): string {
  return format(new Date(iso), "dd.MM.yyyy");
}

interface StudentProfileCardProps {
  student: Student;
  commentKey?: number;
  onEnrollClick?: () => void;
  onHistoryClick?: () => void;
  onPaymentClick?: () => void;
  onPaymentHistoryClick?: () => void;
  onRefundClick?: () => void;
  onWithdrawalClick?: () => void;
  onInitialBalanceClick?: () => void;
  onStatusChanged?: () => void;
  onUnusedLessonsWrittenOff?: () => void;
}

export function StudentProfileCard({ student, commentKey, onEnrollClick, onHistoryClick, onPaymentClick, onPaymentHistoryClick, onRefundClick, onWithdrawalClick, onInitialBalanceClick, onStatusChanged, onUnusedLessonsWrittenOff }: StudentProfileCardProps) {
  const t = useT();
  const { openDrawer } = useEditStudent();
  const router = useRouter();
  const canSeeDetails = useCan("students.details");
  const canManageStudent = useCan("students.manage");
  const canSetInitialBalance = useCan("students.initial-balance");
  const canWriteOffUnused = useCan("debt.write-off");
  const [showUnusedDialog, setShowUnusedDialog] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setShowDelete(false);
    try {
      await api.delete(`/students/${student.id}`, {
        data: { reason: deleteReason.trim() },
      });
      toast.success(t("O'quvchi arxivga o'tkazildi"));
      router.push("/students");
    } catch (error) {
      toast.error(getErrorMessage(error, t("Arxivlashda xatolik yuz berdi")));
    } finally {
      setDeleting(false);
      setDeleteReason("");
    }
  };

  // ARCHIVED status (xato/duplikat yozuv) → o'quvchi ro'yxatdan yo'qoladi, shuning
  // uchun ro'yxatga qaytaramiz. Boshqa statuslarda profilni qayta yuklaymiz
  // (badge + balans yangilanishi uchun — masalan FROZEN prepaid'ni qaytaradi).
  const handleStatusChanged = (newStatus: string) => {
    if (newStatus === "ARCHIVED") {
      router.push("/students");
    } else {
      onStatusChanged?.();
    }
  };

  const deleteReasonValid = deleteReason.trim().length >= 3;
  const isStudentActive = student.status === "ACTIVE";

  const [latestComment, setLatestComment] = useState<{
    content: string;
    author: { firstName: string; lastName: string } | null;
    createdAt: string;
  } | null>(null);

  useEffect(() => {
    if (!canSeeDetails) return;
    api.get("/comments/latest", {
      params: { entityType: "Student", entityId: String(student.id) },
    })
      .then(({ data }) => setLatestComment(data || null))
      .catch(() => {});
  }, [student.id, commentKey, canSeeDetails]);

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
          <p className="text-sm text-muted-foreground">{t("(id: {id})", { id: student.id })}</p>
        </div>

        <StudentStatusBadge student={student} />

        {(() => {
          const zeroedByRefund =
            student.balance === 0 && student.lastTransactionType === "REFUND";
          return (
            <Badge
              className={cn(
                "px-3 py-1 text-sm font-semibold",
                zeroedByRefund
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
                  : student.balance >= 0
                    ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              {t("{amount} balans", { amount: formatBalance(student.balance, t("so'm")) })}
            </Badge>
          );
        })()}

        {/* Only when they actually owe. A debt is one number on this card, and
            most debts here are built from several months — the badge is what
            stops that number reading as this month's arrears. */}
        {student.balance < 0 && (
          <StudentDebtOrigin
            studentId={student.id}
            studentName={`${student.firstName} ${student.lastName}`.trim()}
          />
        )}
      </div>

      {/* Contact info */}
      <div className="space-y-2 text-sm">
        {studentPhoneRows(student).map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="text-muted-foreground">
                  {t(row.label)}:
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {row.signIn
                  ? t("Bu raqam bilan tizimga kiradi")
                  : t("Kirish uchun ishlatilmaydi")}
              </TooltipContent>
            </Tooltip>
            <a
              href={row.telHref}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {formatPhone(row.phone)}
            </a>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <PhoneProofBadge
            verified={student.phoneVerified}
            verifiedAt={student.phoneVerifiedAt}
          />
          <TelegramBotBadge
            chatId={student.telegramChatId}
            disconnectedAt={student.telegramDisconnectedAt}
          />
        </div>
        {student.gender && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t("Jinsi")}:</span>
            <span>{student.gender === "MALE" ? t("Erkak") : t("Ayol")}</span>
          </div>
        )}
        {student.date_of_birth && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t("Tug'ilgan sana")}:</span>
            <span>
              {formatDate(student.date_of_birth)}{" "}
              <span className="text-muted-foreground">
                {t("({n} yosh)", { n: ageFromStoredDate(student.date_of_birth) })}
              </span>
            </span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-muted-foreground">
            {t("Qo'shilgan sana")}:
          </span>
          <span>{formatDate(student.createdAt)}</span>
        </div>
      </div>

      {canManageStudent && (
        <>
          <Separator />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEnrollClick}>
              <UserPlus className="mr-1.5 size-4" />
              {student.groups.length > 0 ? t("Guruhni o'zgartirish") : t("Guruhga qo'shish")}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <CreditCard className="mr-1.5 size-4" />
                  {t("To'lov")}
                  <ChevronDown className="ml-1.5 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onPaymentClick}>{t("To'lov qo'shish")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onPaymentHistoryClick}>{t("To'lov tarixi")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onRefundClick}>{t("Pulni qaytarish")}</DropdownMenuItem>
                {onWithdrawalClick && (
                  <DropdownMenuItem onClick={onWithdrawalClick}>{t("Yechib olish")}</DropdownMenuItem>
                )}
                {canSetInitialBalance && onInitialBalanceClick && (
                  <DropdownMenuItem onClick={onInitialBalanceClick}>
                    {t("Boshlang'ich balans")}
                  </DropdownMenuItem>
                )}
                {canWriteOffUnused && student.balance < 0 && (
                  <DropdownMenuItem onClick={() => setShowUnusedDialog(true)}>
                    {t("Foydalanilmagan darslar qarzini bekor qilish")}
                  </DropdownMenuItem>
                )}
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
              <TooltipContent>{t("Tahrirlash")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  onClick={() => setShowStatus(true)}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Status o'zgartirish")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  onClick={onHistoryClick}
                >
                  <Clock className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Tarix")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("O'chirish")}</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* Dialogs */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="size-5 text-destructive" />
              {t("Arxivga o'tkazish")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <strong>{student.firstName} {student.lastName}</strong>{" "}
                  {t("ro'yxatdan butunlay yo'qoladi. Bu o'chirish emas — yozuv arxivlanadi.")}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 px-6 pb-2">
            {/* Active student warning */}
            {isStudentActive && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="mb-1 font-medium">
                  {t("⚠️ Bu o'quvchi hozir FAOL holatda.")}
                </p>
                <p>
                  {t("Agar o'qishni tashlagan bo'lsa — Status ni “Chetlatildi” ga o'zgartiring. Arxivlash faqat xato yoki duplikat yozuv uchun.")}
                </p>
              </div>
            )}

            {/* What happens */}
            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              <p className="mb-2 font-medium">{t("Nima bo'ladi:")}</p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>{t("Talaba barcha ro'yxatlardan yashiriladi (faqat CEO arxivdan ko'radi)")}</li>
                <li>{t("Aktiv guruhlardan chiqariladi, oldindan to'langan pul balansga qaytariladi")}</li>
                <li>{t("Keyinroq CEO orqali tiklash mumkin")}</li>
              </ul>
            </div>

            {/* Mandatory reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                {t("Sabab")} <span className="text-destructive">*</span>{" "}
                <span className="text-muted-foreground">{t("(kamida 3 belgi)")}</span>
              </label>
              <Textarea
                placeholder={t("Masalan: xato kiritilgan, duplikat yozuv, ...")}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !deleteReasonValid}
              variant="destructive"
            >
              {deleting ? t("Arxivlanmoqda...") : t("Arxivga o'tkazish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="students"
        entityId={student.id}
        entityName={`${student.firstName} ${student.lastName}`}
        currentStatus={student.status || "ACTIVE"}
        onStatusChanged={handleStatusChanged}
      />

      {canWriteOffUnused && (
        <UnusedDepartureLessonsDialog
          studentId={student.id}
          open={showUnusedDialog}
          onOpenChange={setShowUnusedDialog}
          onWrittenOff={onUnusedLessonsWrittenOff}
        />
      )}

      {canSeeDetails && (
        <>
          <Separator />

          {/* So'nggi izoh */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Flag className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("So'nggi izoh")}</span>
            </div>
            {latestComment ? (
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
                <p className="text-sm leading-relaxed line-clamp-3">{latestComment.content}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium">{latestComment.author ? `${latestComment.author.firstName} ${latestComment.author.lastName}` : t("Tizim (avtomatik)")}</span>
                  <span>&middot;</span>
                  <span>{format(new Date(latestComment.createdAt), "dd.MM.yyyy, HH:mm")}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {student.comment || t("Izoh mavjud emas")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
