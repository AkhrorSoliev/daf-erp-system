"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { TeacherProfileCard } from "./teacher-profile-card";
import { TeacherProfileTabs } from "./teacher-profile-tabs";
import { MobileProfileHeader } from "@/components/shared/mobile-profile-header";
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
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import { useAuth } from "@/hooks/use-auth";
import { useEditTeacher, type TeacherData } from "@/hooks/use-edit-teacher";
import { useIsMobile } from "@/hooks/use-mobile";
import api from "@/lib/api";

export function TeacherProfileClient({ teacherId }: { teacherId: string }) {
  const setName = useBreadcrumbName((s) => s.setName);
  const authUser = useAuth((s) => s.user);
  const canManageTeachers = authUser?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "guruhlar";
  const { openDrawer } = useEditTeacher();
  const [teacher, setTeacher] = useState<TeacherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "guruhlar") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const fetchTeacher = useCallback(async () => {
    try {
      const { data } = await api.get(`/teachers/${teacherId}`);
      setTeacher(data);
      setName(teacherId, `${data.firstName} ${data.lastName}`);
    } catch {
      setError("O'qituvchi topilmadi");
    } finally {
      setLoading(false);
    }
  }, [teacherId, setName]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  const handleDelete = () => {
    if (!teacher) return;
    router.push("/teachers");
    toast.success("O'qituvchi muvaffaqiyatli o'chirildi");
    api.delete(`/teachers/${teacher.id}`).catch(() => {
      toast.error("O'chirishda xatolik yuz berdi");
    });
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">O&apos;qituvchi topilmadi</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const fullName = `${teacher.firstName} ${teacher.lastName}`;

  const mobileActions = canManageTeachers
    ? [
        {
          icon: <Pencil className="size-4" />,
          label: "Tahrirlash",
          onClick: () => openDrawer(teacher),
        },
        {
          icon: <Trash2 className="size-4" />,
          label: "O'chirish",
          onClick: () => setDeleteConfirmOpen(true),
          variant: "destructive" as const,
        },
      ]
    : undefined;

  const mobileInfoItems = [
    ...(teacher.gender
      ? [{ label: "Jinsi", value: teacher.gender === "MALE" ? "Erkak" : "Ayol" }]
      : []),
    ...(teacher.login ? [{ label: "Login", value: teacher.login }] : []),
    { label: "Qo'shilgan", value: format(new Date(teacher.createdAt), "dd.MM.yyyy") },
  ];

  return (
    <>
      {isMobile ? (
        <div className="space-y-3">
          <MobileProfileHeader
            photo={teacher.photo}
            fullName={fullName}
            id={teacher.id}
            roles={teacher.roles}
            roleVariant="green"
            isActive={teacher.isActive}
            balance={canManageTeachers ? teacher.balance : undefined}
            phone={teacher.phone}
            branches={teacher.branches}
            infoItems={mobileInfoItems}
            actions={mobileActions}
          />
          <TeacherProfileTabs
            teacher={teacher}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="w-full lg:w-85 lg:shrink-0">
            <TeacherProfileCard teacher={teacher} />
          </div>
          <div className="min-w-0 flex-1">
            <TeacherProfileTabs
            teacher={teacher}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
          </div>
        </div>
      )}

      {canManageTeachers && (
        <>
          <EditTeacherDrawer
            onSaved={(updated) => {
              setTeacher(updated);
              setName(teacherId, `${updated.firstName} ${updated.lastName}`);
            }}
          />
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
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
        </>
      )}
    </>
  );
}
