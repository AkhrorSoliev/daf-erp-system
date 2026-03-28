"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  BookOpenIcon,
  UsersIcon,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditGroupDrawer } from "./edit-group-drawer";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
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
  monday: "Dushanba",
  tuesday: "Seshanba",
  wednesday: "Chorshanba",
  thursday: "Payshanba",
  friday: "Juma",
  saturday: "Shanba",
};

interface GroupDetailClientProps {
  id: string;
}

export function GroupDetailClient({ id }: GroupDetailClientProps) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const { openDrawer } = useEditGroup();
  const setName = useBreadcrumbName((s) => s.setName);
  const user = useAuth((s) => s.user);
  const canManage =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
      setName(id, data.name);
    } catch {
      // xatolik
    } finally {
      setLoading(false);
    }
  }, [id, setName]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center">
        Yuklanmoqda...
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center">
        Guruh topilmadi
      </div>
    );
  }

  const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {group.name}
            </h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {group.groupNumber && (
            <p className="text-muted-foreground text-sm">
              Guruh #{group.groupNumber}
            </p>
          )}
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => openDrawer(group)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Kurs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BookOpenIcon className="size-4" />
              Kurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{group.course.name}</p>
            {group.course.courseDuration && (
              <p className="text-muted-foreground">
                Davomiyligi: {group.course.courseDuration} oy
              </p>
            )}
            {group.course.lessonDuration && (
              <p className="text-muted-foreground">
                Dars: {group.course.lessonDuration} daqiqa
              </p>
            )}
            <p className="text-muted-foreground">
              Narxi:{" "}
              {group.course.price
                .toString()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{" "}
              so&apos;m
            </p>
          </CardContent>
        </Card>

        {/* Jadval */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ClockIcon className="size-4" />
              Jadval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {group.days && (
              <p className="font-medium">{DAYS_MAP[group.days]}</p>
            )}
            {group.exactDays.length > 0 && (
              <p className="text-muted-foreground">
                {group.exactDays
                  .map((d) => WEEKDAY_LABELS[d] ?? d)
                  .join(", ")}
              </p>
            )}
            {group.lessonStartTime && group.lessonEndTime && (
              <p className="text-muted-foreground">
                {group.lessonStartTime} – {group.lessonEndTime}
              </p>
            )}
            {!group.days &&
              group.exactDays.length === 0 &&
              !group.lessonStartTime && (
                <p className="text-muted-foreground">Belgilanmagan</p>
              )}
          </CardContent>
        </Card>

        {/* Sanalar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CalendarIcon className="size-4" />
              Sanalar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {group.startDate && (
              <p>
                <span className="text-muted-foreground">Boshlanish: </span>
                {format(new Date(group.startDate), "dd.MM.yyyy")}
              </p>
            )}
            {group.endDate && (
              <p>
                <span className="text-muted-foreground">Tugash: </span>
                {format(new Date(group.endDate), "dd.MM.yyyy")}
              </p>
            )}
            {!group.startDate && (
              <p className="text-muted-foreground">Belgilanmagan</p>
            )}
          </CardContent>
        </Card>

        {/* Xona */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MapPinIcon className="size-4" />
              Xona
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {group.room ? (
              <div>
                <p className="font-medium">{group.room.name}</p>
                {group.room.capacity && (
                  <p className="text-muted-foreground">
                    Sig&apos;imi: {group.room.capacity} o&apos;rin
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Belgilanmagan</p>
            )}
          </CardContent>
        </Card>

        {/* O'qituvchilar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UsersIcon className="size-4" />
              O&apos;qituvchilar
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {group.teachers.length > 0 ? (
              <div className="space-y-1">
                {group.teachers.map((t) => (
                  <p key={t.id} className="font-medium">
                    {t.name}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Belgilanmagan</p>
            )}
          </CardContent>
        </Card>

        {/* O'quvchilar soni */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UsersIcon className="size-4" />
              O&apos;quvchilar
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-3xl font-bold">{group.studentCount}</p>
            <p className="text-muted-foreground">ta o&apos;quvchi</p>
          </CardContent>
        </Card>
      </div>

      {/* Izoh */}
      {group.comment && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Izoh</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{group.comment}</CardContent>
        </Card>
      )}

      <EditGroupDrawer
        onSaved={(updated) => {
          setGroup(updated);
          setName(id, updated.name);
        }}
      />
    </div>
  );
}
