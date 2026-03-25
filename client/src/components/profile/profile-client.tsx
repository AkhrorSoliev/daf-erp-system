"use client";

import { useAuth } from "@/hooks/use-auth";
import { ProfileCard } from "./profile-card";
import { ProfileDetails } from "./profile-details";
import { EditProfileDrawer } from "./edit-profile-drawer";
import { ChangePasswordDrawer } from "./change-password-drawer";
import { useState } from "react";

export function ProfileClient() {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Profil
        </h1>

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
      </div>

      <EditProfileDrawer open={editOpen} onClose={() => setEditOpen(false)} />
      <ChangePasswordDrawer
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}
