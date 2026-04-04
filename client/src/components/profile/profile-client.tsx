"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileCard } from "./profile-card";
import { ProfileDetails } from "./profile-details";
import { EditProfileDrawer } from "./edit-profile-drawer";
import { ChangePasswordDrawer } from "./change-password-drawer";
import { MobileProfileHeader } from "@/components/shared/mobile-profile-header";

export function ProfileClient() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const isCeo = user?.roles.some((r) => r.name === "CEO") ?? false;
  const { branches, fetchBranches } = useBranchSwitcher();

  useEffect(() => {
    if (isCeo) {
      fetchBranches();
    }
  }, [isCeo, fetchBranches]);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;
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
          <MobileProfileHeader
            photo={user.photo}
            fullName={fullName}
            id={user.id}
            roles={user.roles}
            balance={user.balance}
            phone={user.phone}
            branches={displayBranches}
            infoItems={[
              { label: "Kompaniya", value: user.company.name },
            ]}
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
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="w-full lg:w-85 lg:shrink-0">
              <ProfileCard user={user} onEdit={() => setEditOpen(true)} />
            </div>
            <div className="min-w-0 flex-1">
              <ProfileDetails
                user={user}
                onChangePassword={() => setPasswordOpen(true)}
              />
            </div>
          </div>
        )}
      </div>

      <EditProfileDrawer open={editOpen} onClose={() => setEditOpen(false)} />
      <ChangePasswordDrawer
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}
