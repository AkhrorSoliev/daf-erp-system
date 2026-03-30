"use client";

import { format } from "date-fns";
import { Pencil, QrCode } from "lucide-react";
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
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";

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
}

export function GroupInfoCard({ group }: GroupInfoCardProps) {
  const { openDrawer } = useEditGroup();
  const user = useAuth((s) => s.user);
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
              ? group.teachers.map((t) => t.name).join(", ")
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
