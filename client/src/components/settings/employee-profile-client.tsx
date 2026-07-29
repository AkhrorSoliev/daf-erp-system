"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { EmployeeProfileCard } from "./employee-profile-card";
import { EmployeeProfileTabs } from "./employee-profile-tabs";
import { EditEmployeeDrawer } from "./edit-employee-drawer";
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
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import api from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  "Branch Director": "Direktor",
  Administrator: "Administrator",
  Teacher: "O'qituvchi",
  Cashier: "Kassir",
};

export function EmployeeProfileClient({ employeeId }: { employeeId: string }) {
  const setName = useBreadcrumbName((s) => s.setName);
  const authUser = useAuth((s) => s.user);
  const canSeeBalance =
    authUser?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const canSeeTimeline =
    authUser?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openDrawer } = useEditEmployee();
  const [employee, setEmployee] = useState<EmployeeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // O'qituvchilar uchun "Guruhlar", boshqa xodimlar uchun "Izohlar" —
  // o'qituvchi profili bilan bir xil bo'lishi uchun.
  const isTeacher = employee?.roles.some((r) => r.id === 4) ?? false;
  const canDelete = canSeeBalance && employee != null && employee.id !== authUser?.id;
  const defaultTab = isTeacher ? "guruhlar" : "izohlar";

  // Faqat shu xodim + ko'ruvchi roli uchun mavjud tablar. Eski/qo'lda URL
  // (masalan o'qituvchi bo'lmagan xodimda ?tab=guruhlar) bo'sh panel ko'rsatmasligi uchun.
  const availableTabs = [
    ...(isTeacher ? ["guruhlar"] : []),
    "izohlar",
    "tarix",
    ...(canSeeTimeline ? ["taymlayn"] : []),
    ...(canSeeBalance && isTeacher ? ["ish-haqi"] : []),
  ];
  const urlTab = searchParams.get("tab");
  const activeTab = urlTab && availableTabs.includes(urlTab) ? urlTab : defaultTab;

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams, defaultTab],
  );

  const handleDelete = () => {
    if (!employee) return;
    router.push("/settings/employees");
    toast.success("Xodim arxivga o'tkazildi");
    api.delete(`/users/${employee.id}`).catch(() => {
      toast.error("O'chirishda xatolik yuz berdi");
    });
  };

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users/${employeeId}`);
      setEmployee(data);
      setName(employeeId, `${data.firstName} ${data.lastName}`);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId, setName]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const [commentKey, setCommentKey] = useState(0);
  const handleCommentChange = useCallback(() => {
    setCommentKey((k) => k + 1);
  }, []);

  // Fetch latest comment for mobile header
  const [latestComment, setLatestComment] = useState<{
    content: string;
    isTask?: boolean;
    author: { firstName: string; lastName: string };
    createdAt: string;
  } | null>(null);

  useEffect(() => {
    if (!employee) return;
    api
      .get("/comments/latest", {
        params: { entityType: "User", entityId: String(employee.id) },
      })
      .then(({ data }) => setLatestComment(data || null))
      .catch(() => {});
  }, [employee?.id, commentKey]);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Xodim topilmadi</h1>
        <p className="text-muted-foreground">
          ID: {employeeId} bo&apos;yicha xodim mavjud emas
        </p>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;

  const mobileInfoItems = [
    ...(employee.gender
      ? [{ label: "Jinsi", value: employee.gender === "MALE" ? "Erkak" : "Ayol" }]
      : []),
    ...(employee.login ? [{ label: "Login", value: employee.login }] : []),
    { label: "Qo'shilgan", value: format(new Date(employee.createdAt), "dd.MM.yyyy") },
  ];

  const mobileComment = latestComment
    ? {
        content: latestComment.content,
        author: `${latestComment.author.firstName} ${latestComment.author.lastName}`,
        date: format(new Date(latestComment.createdAt), "dd.MM.yyyy, HH:mm"),
        isTask: latestComment.isTask,
      }
    : null;

  return (
    <>
      {isMobile ? (
        <div className="space-y-3">
          <MobileProfileHeader
            photo={employee.photo}
            fullName={fullName}
            id={employee.id}
            roles={employee.roles.map((r) => ({
              ...r,
              name: ROLE_LABELS[r.name] || r.name,
            }))}
            isActive={employee.status === "ACTIVE"}
            salaryDueUserId={canSeeBalance ? employee.id : undefined}
            phone={employee.phone}
            branches={employee.branches}
            infoItems={mobileInfoItems}
            latestComment={mobileComment}
            actions={[
              {
                icon: <Pencil className="size-4" />,
                label: "Tahrirlash",
                onClick: () => openDrawer(employee),
              },
              ...(canDelete
                ? [
                    {
                      icon: <Trash2 className="size-4" />,
                      label: "O'chirish",
                      onClick: () => setDeleteConfirmOpen(true),
                      variant: "destructive" as const,
                    },
                  ]
                : []),
            ]}
          />
          <EmployeeProfileTabs
            employee={employee}
            onCommentChange={handleCommentChange}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="w-full lg:w-85 lg:shrink-0">
            <EmployeeProfileCard employee={employee} commentKey={commentKey} />
          </div>
          <div className="min-w-0 flex-1">
            <EmployeeProfileTabs
            employee={employee}
            onCommentChange={handleCommentChange}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
          </div>
        </div>
      )}
      <EditEmployeeDrawer onSaved={(updated) => {
        setEmployee(updated);
        setName(employeeId, `${updated.firstName} ${updated.lastName}`);
      }} />

      {canDelete && (
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xodimni o&apos;chirish</AlertDialogTitle>
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
      )}
    </>
  );
}
