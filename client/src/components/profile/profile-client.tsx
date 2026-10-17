"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileCard } from "./profile-card";
import { ProfileDetails } from "./profile-details";
import { EditProfileDrawer } from "./edit-profile-drawer";
import { ChangePasswordDrawer } from "./change-password-drawer";
import { LogoutOthersDialog } from "@/components/shared/logout-others-dialog";
import { MobileProfileHeader } from "@/components/shared/mobile-profile-header";
import { TeacherStatsCharts } from "@/components/teachers/teacher-stats-charts";
import { isTeacherOnly } from "@/lib/teacher-only";
import { hasOwnSalary, uzbekRoles } from "./profile-roles";
import { TeacherProfileLinks } from "./teacher-profile-links";

const TEACHER_ROLE_ID = 4;

export function ProfileClient() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);

  const isCeo = user?.roles.some((r) => r.name === "CEO") ?? false;
  // Identity, not a capability: the charts are a teacher's own figures.
  const isTeacher = user?.roles.some((r) => r.id === TEACHER_ROLE_ID) ?? false;
  const { branches, fetchBranches } = useBranchSwitcher();

  useEffect(() => {
    if (isCeo) {
      fetchBranches();
    }
  }, [isCeo, fetchBranches]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;
  const uzRoles = uzbekRoles(user.roles);
  const showSalary = hasOwnSalary(user.roles);
  // A teacher on a phone: the side menu is gone, so this page also holds the
  // guide and the support link, and the salary block opens «Oylik».
  const phoneTeacher = isMobile && isTeacherOnly(user.roles);
  const displayBranches = isCeo
    ? branches.map((b) => ({ id: b.id, name: b.name }))
    : user.branches;

  return (
    <>
      <div className="space-y-6">
        <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
          Profil
        </h1>

        {isMobile ? (
          <>
            <MobileProfileHeader
              photo={user.photo}
              fullName={fullName}
              id={user.id}
              roles={uzRoles}
              salaryDueUserId={showSalary ? user.id : undefined}
              salaryDueScope="me"
              salaryDueHref={phoneTeacher ? "/profile/salary" : undefined}
              phone={user.phone}
              branches={displayBranches}
              infoItems={[{ label: "Kompaniya", value: user.company.name }]}
              showActionsInline
              actions={[
                {
                  icon: <Pencil className="size-4" />,
                  label: "Tahrirlash",
                  onClick: () => setEditOpen(true),
                },
                {
                  icon: <KeyRound className="size-4" />,
                  label: "Parolni o'zgartirish",
                  onClick: () => setPasswordOpen(true),
                },
              ]}
            />
            {/* Not a third inline header action: those share one row
              (`flex-1`) and this label does not fit beside two others at
              375px. */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLogoutOthersOpen(true)}
            >
              <LogOut className="mr-1.5 size-4" />
              Boshqa qurilmalardan chiqish
            </Button>
            {phoneTeacher && <TeacherProfileLinks />}
          </>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="w-full lg:w-85 lg:shrink-0">
              <ProfileCard
                user={user}
                roles={uzRoles}
                showSalary={showSalary}
                onEdit={() => setEditOpen(true)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <ProfileDetails
                user={user}
                onChangePassword={() => setPasswordOpen(true)}
                onLogoutOthers={() => setLogoutOthersOpen(true)}
              />
            </div>
          </div>
        )}

        {isTeacher && (
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">Ko&apos;rsatkichlarim</h2>
            <TeacherStatsCharts endpoint="/teachers/me/stats" />
          </section>
        )}
      </div>

      <EditProfileDrawer open={editOpen} onClose={() => setEditOpen(false)} />
      <ChangePasswordDrawer
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
      <LogoutOthersDialog
        open={logoutOthersOpen}
        onOpenChange={setLogoutOthersOpen}
      />
    </>
  );
}
