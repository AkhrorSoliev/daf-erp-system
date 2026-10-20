"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { EmployeeProfileCard } from "./employee-profile-card";
import { EmployeeProfileTabs } from "./employee-profile-tabs";
import { isKpiAdministrator, showKpiTab } from "@/components/reports/admin-kpi/kpi-format";
import { useKpiUser } from "@/components/reports/admin-kpi/kpi-queries";
import { currentMonthKey } from "@/components/payments/salary-utils";
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
import { usePublishEntity } from "@/components/tasks/entity-context";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import api from "@/lib/api";
import { roleTitle } from "@/components/profile/profile-roles";
import { useT } from "@/i18n/context";

export function EmployeeProfileClient({ employeeId }: { employeeId: string }) {
  const t = useT();
  const setName = useBreadcrumbName((s) => s.setName);
  const authUser = useAuth((s) => s.user);
  const canSeeBalance = useCan("salary.view");
  const canSeeTimeline = useCan("teachers.view");
  // DELETE /users/:id needs `employees.manage`, not the salary capability.
  const canManageEmployees = useCan("employees.manage");
  const canSeeKpi = useCan("kpi.view");
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
  // Spec §7.8: the «KPI» tab, for `kpi.view`, of a current Administrator (no request
  // until the tab opens) or of anyone with a KPI result — for a non-administrator
  // one request on load asks (`hasAny`); it is the tab's own current-month query.
  const kpiProbeId =
    canSeeKpi && employee && !isKpiAdministrator(employee.roles) ? employee.id : null;
  const kpiProbe = useKpiUser(kpiProbeId, currentMonthKey());
  const hasKpiTab = showKpiTab(employee?.roles, canSeeKpi, kpiProbe.data?.hasAny === true);
  const canDelete = canManageEmployees && employee != null && employee.id !== authUser?.id;
  const defaultTab = isTeacher ? "guruhlar" : "izohlar";

  // Faqat shu xodim + ko'ruvchi roli uchun mavjud tablar. Eski/qo'lda URL
  // (masalan o'qituvchi bo'lmagan xodimda ?tab=guruhlar) bo'sh panel ko'rsatmasligi uchun.
  const availableTabs = [
    ...(isTeacher ? ["guruhlar"] : []),
    "izohlar",
    "tarix",
    ...(canSeeTimeline ? ["taymlayn"] : []),
    ...(canSeeBalance && isTeacher ? ["ish-haqi"] : []),
    ...(hasKpiTab ? ["kpi"] : []),
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
    toast.success(t("Xodim arxivga o'tkazildi"));
    api.delete(`/users/${employee.id}`).catch(() => {
      toast.error(t("O'chirishda xatolik yuz berdi"));
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

  usePublishEntity(
    "User",
    employee ? String(employee.id) : null,
    employee ? `${employee.firstName} ${employee.lastName}` : "",
  );

  const [commentKey, setCommentKey] = useState(0);
  const handleCommentChange = useCallback(() => {
    setCommentKey((k) => k + 1);
  }, []);

  // Fetch latest comment for mobile header
  const [latestComment, setLatestComment] = useState<{
    content: string;
    author: { firstName: string; lastName: string } | null;
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
        <h1 className="text-2xl font-bold">{t("Xodim topilmadi")}</h1>
        <p className="text-muted-foreground">
          {t("ID: {id} bo'yicha xodim mavjud emas", { id: employeeId })}
        </p>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;

  const mobileInfoItems = [
    ...(employee.gender
      ? [{ label: t("Jinsi"), value: employee.gender === "MALE" ? t("Erkak") : t("Ayol") }]
      : []),
    ...(employee.login ? [{ label: t("Login"), value: employee.login }] : []),
    { label: t("Qo'shilgan sana"), value: format(new Date(employee.createdAt), "dd.MM.yyyy") },
  ];

  const mobileComment = latestComment
    ? {
        content: latestComment.content,
        author: latestComment.author
          ? `${latestComment.author.firstName} ${latestComment.author.lastName}`
          : t("Tizim (avtomatik)"),
        date: format(new Date(latestComment.createdAt), "dd.MM.yyyy, HH:mm"),
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
              name: roleTitle(r, t),
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
                label: t("Tahrirlash"),
                onClick: () => openDrawer(employee),
              },
              ...(canDelete
                ? [
                    {
                      icon: <Trash2 className="size-4" />,
                      label: t("O'chirish"),
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
            showKpi={hasKpiTab}
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
            showKpi={hasKpiTab}
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
              <AlertDialogTitle>{t("Xodimni o'chirish")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("\"{name}\" arxivga o'tkaziladi. Keyinchalik arxivdan tiklash mumkin.", { name: fullName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                variant="destructive"
              >
                {t("O'chirish")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
