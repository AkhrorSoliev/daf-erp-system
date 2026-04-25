"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  BookOpen,
  Clock,
  Users,
  Banknote,
  FileText,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditCourse } from "@/hooks/use-edit-course";
import type { Course } from "@/hooks/use-edit-course";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import { EditCourseDrawer } from "./edit-course-drawer";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";

interface CourseDetailClientProps {
  courseId: string;
}

export function CourseDetailClient({ courseId }: CourseDetailClientProps) {
  const router = useRouter();
  const openDrawer = useEditCourse((s) => s.openDrawer);
  const setName = useBreadcrumbName((s) => s.setName);
  const [course, setCourse] = useState<Course | null>(null);
  const [groupCount, setGroupCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchCourse() {
      try {
        const { data } = await api.get(`/courses/${courseId}`);
        const c: Course = {
          id: data.id,
          name: data.name,
          description: data.description,
          lessonDuration: data.lessonDuration,
          lessonMinutes: data.lessonMinutes ?? null,
          courseDuration: data.courseDuration,
          price: data.price,
          isActive: data.isActive,
          branchId: data.branchId,
        };
        setCourse(c);
        setGroupCount(data._count?.groups ?? 0);
        setName(courseId, data.name);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchCourse();
  }, [courseId, setName]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Kurs topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {courseId} bo&apos;yicha kurs mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden sm:inline-flex"
              onClick={() => router.push("/settings/courses")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Orqaga</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {course.name}
            </h2>
            <Badge variant={course.isActive ? "default" : "secondary"}>
              {course.isActive ? "Faol" : "Nofaol"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Kurs ma&apos;lumotlari va boshqaruv
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDrawer(course)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Kursni tahrirlash</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: Course info */}
        <div className="rounded-lg border">
          <div className="space-y-0 divide-y">
            <InfoRow
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
              label="Tavsif"
              value={course.description ?? "—"}
            />
            <InfoRow
              icon={<Banknote className="h-4 w-4 text-muted-foreground" />}
              label="Narx"
              value={`${formatPrice(course.price)} so'm`}
            />
            <InfoRow
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              label="Guruhlar"
              value={`${groupCount} ta`}
            />
            <InfoRow
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              label="Kurs davomiyligi"
              value={
                course.courseDuration
                  ? `${course.courseDuration} oy`
                  : "—"
              }
            />
            <InfoRow
              icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
              label="Darslar soni"
              value={
                course.lessonDuration
                  ? `${course.lessonDuration} ta`
                  : "—"
              }
            />
          </div>
        </div>

        {/* Right: Tabs */}
        <Tabs defaultValue="groups">
          <TabsList>
            <TabsTrigger value="groups">Guruhlar</TabsTrigger>
            <TabsTrigger value="materials">Materiallar</TabsTrigger>
            <TabsTrigger value="plan">Reja</TabsTrigger>
          </TabsList>

          <TabsContent value="groups">
            <EmptyTabContent
              icon={<Users className="h-8 w-8 text-muted-foreground/50" />}
              message="Ushbu kursdan foydalanadigan guruhlar yo'q"
            />
          </TabsContent>

          <TabsContent value="materials">
            <EmptyTabContent
              icon={
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              }
              message="Materiallar hali qo'shilmagan"
            />
          </TabsContent>

          <TabsContent value="plan">
            <EmptyTabContent
              icon={
                <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              }
              message="Reja hali tuzilmagan"
            />
          </TabsContent>
        </Tabs>
      </div>

      <EditCourseDrawer
        onSaved={(updated) => setCourse(updated)}
      />
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyTabContent({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
      {icon}
      <p className="text-sm">{message}</p>
    </div>
  );
}
