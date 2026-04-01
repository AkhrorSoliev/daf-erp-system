"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Pencil, QrCode, MessageSquare } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommentForm } from "@/components/shared/comment-form";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";

const STATUS_MAP: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  1: { label: "Faol", variant: "default" },
  2: { label: "Boshlanmagan", variant: "secondary" },
  3: { label: "Pauza", variant: "outline" },
  4: { label: "To'xtatilgan", variant: "destructive" },
};

const DAYS_MAP: Record<string, string> = {
  odd: "Toq kunlar",
  even: "Juft kunlar",
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Du",
  tuesday: "Se",
  wednesday: "Cho",
  thursday: "Pa",
  friday: "Ju",
  saturday: "Sha",
};

function formatPrice(price: number) {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface GroupInfoCardProps {
  group: GroupData;
  commentKey?: number;
  onCommentChange?: () => void;
}

export function GroupInfoCard({ group, commentKey, onCommentChange }: GroupInfoCardProps) {
  const { openDrawer } = useEditGroup();
  const user = useAuth((s) => s.user);

  const [latestComment, setLatestComment] = useState<{
    content: string;
    isTask?: boolean;
    author: { firstName: string; lastName: string };
    createdAt: string;
  } | null>(null);

  useEffect(() => {
    api.get("/comments/latest", {
      params: { entityType: "Group", entityId: group.id },
    })
      .then(({ data }) => setLatestComment(data || null))
      .catch(() => {});
  }, [group.id, commentKey]);
  const canManage =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];

  const daysLabel = group.days
    ? DAYS_MAP[group.days]
    : group.exactDays.length > 0
      ? group.exactDays.map((d) => WEEKDAY_LABELS[d] ?? d).join(", ")
      : null;

  const timeLabel =
    group.lessonStartTime && group.lessonEndTime
      ? `${group.lessonStartTime} – ${group.lessonEndTime}`
      : null;

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* Header: Name + Status */}
      <div className="mb-4 flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-lg font-bold">{group.name}</h2>
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {group.groupNumber && (
            <span className="text-xs text-muted-foreground">
              #{group.groupNumber}
            </span>
          )}
        </div>
      </div>

      <Separator className="mb-3" />

      {/* Info rows */}
      <div className="space-y-2.5 text-sm">
        <InfoRow label="Kurs" value={group.course.name} />
        {group.course.courseDuration && (
          <InfoRow
            label="Davomiyligi"
            value={`${group.course.courseDuration} oy`}
          />
        )}
        <InfoRow
          label="Narxi"
          value={`${formatPrice(group.course.price)} so'm`}
        />

        <Separator className="my-3!" />

        {daysLabel && <InfoRow label="Kunlar" value={daysLabel} />}
        {timeLabel && <InfoRow label="Vaqt" value={timeLabel} />}
        {group.startDate && (
          <InfoRow
            label="Boshlanish"
            value={format(new Date(group.startDate), "dd.MM.yyyy")}
          />
        )}
        {group.endDate && (
          <InfoRow
            label="Tugash"
            value={format(new Date(group.endDate), "dd.MM.yyyy")}
          />
        )}

        <Separator className="my-3!" />

        <InfoRow
          label="Xona"
          value={
            group.room
              ? `${group.room.name}${group.room.capacity ? ` (${group.room.capacity})` : ""}`
              : "—"
          }
        />
        <InfoRow
          label="O'qituvchi"
          value={
            group.teachers.length > 0
              ? group.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")
              : "—"
          }
        />
        <InfoRow
          label="O'quvchilar"
          value={`${group.studentCount} ta`}
          bold
        />
      </div>

      {/* Comment */}
      {group.comment && (
        <>
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground italic">
            {group.comment}
          </p>
        </>
      )}

      {/* So'nggi izoh + Izoh qo'shish */}
      <Separator className="my-3" />
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">So&apos;nggi izoh</span>
        </div>
        {latestComment ? (
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
            <p className="text-sm leading-relaxed line-clamp-3">{latestComment.content}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium">{latestComment.author.firstName} {latestComment.author.lastName}</span>
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
          <p className="text-xs text-muted-foreground italic">Izohlar yo&apos;q</p>
        )}
        <CommentForm
          entityType="Group"
          entityId={group.id}
          onConfirmed={() => onCommentChange?.()}
        />
      </div>

      {/* Actions */}
      {canManage && (
        <>
          <Separator className="my-3" />
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openDrawer(group)}
                >
                  <Pencil className="mr-1.5 size-3.5" />
                  Tahrirlash
                </Button>
              </TooltipTrigger>
              <TooltipContent>Guruh ma&apos;lumotlarini tahrirlash</TooltipContent>
            </Tooltip>

            <Dialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="size-8 p-0">
                      <QrCode className="size-4" />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>QR kod — guruhga ro&apos;yxatdan o&apos;tish</TooltipContent>
              </Tooltip>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>QR kod — {group.name}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="rounded-lg border bg-white p-4">
                    <QRCodeSVG
                      value={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=student_${group.branchId}_group_${group.id}`}
                      size={280}
                      level="M"
                    />
                  </div>
                  <p className="text-muted-foreground text-center text-sm">
                    Ushbu QR kodni skanerlang va &quot;{group.name}&quot; guruhiga ro&apos;yxatdan o&apos;ting
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : "text-right"}>{value}</span>
    </div>
  );
}
