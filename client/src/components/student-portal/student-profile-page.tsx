"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import {
  Camera,
  CircleNotch,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Screen, StackHeader, Card, Avatar, LoadingCards } from "./lumio";
import { StudentIdCopy } from "./student-id-copy";
import { StudentNameDialog } from "./student-name-dialog";
import { StudentExtraPhoneDialog } from "./student-extra-phone-dialog";
import { extraPhoneRowState } from "./extra-phone-row-state";
import { useExtraPhone, useStudentProfile } from "./lib/queries";
import type { StudentProfile } from "./lib/types";

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${last ? "" : "border-b border-line"}`}
    >
      <span className="text-sm font-semibold text-ink-500">{label}</span>
      <span className="flex-1 truncate text-right font-display font-bold text-ink-900">
        {value}
      </span>
    </div>
  );
}

export function StudentProfilePage() {
  const { data: profile, isLoading } = useStudentProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const { data: extraPhone } = useExtraPhone();
  // The mode outlives the open flag so the dialog keeps its content while it
  // fades out (a remove dialog must not flash the add form on close).
  const [extraPhoneOpen, setExtraPhoneOpen] = useState(false);
  const [extraPhoneMode, setExtraPhoneMode] = useState<"set" | "remove">("set");
  const extraRow = extraPhoneRowState(extraPhone);
  function openExtraPhone(mode: "set" | "remove") {
    setExtraPhoneMode(mode);
    setExtraPhoneOpen(true);
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    try {
      const res = await api.post("/student-portal/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      queryClient.setQueryData<StudentProfile>(
        ["student-portal", "profile"],
        (old) => (old ? { ...old, photo: res.data.photo } : old),
      );
      toast.success("Rasm muvaffaqiyatli yangilandi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Rasmni yuklashda xatolik"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto() {
    setBusy(true);
    try {
      await api.delete("/student-portal/photo");
      queryClient.setQueryData<StudentProfile>(
        ["student-portal", "profile"],
        (old) => (old ? { ...old, photo: null } : old),
      );
      toast.success("Rasm o'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Rasmni o'chirishda xatolik"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <Screen narrow>
        <StackHeader title="Profil" backHref="/portal/more" />
        <LoadingCards count={2} />
      </Screen>
    );
  }

  const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "";
  const branchNames = profile?.branches.map((b) => b.name).join(", ") || null;

  return (
    <Screen narrow>
      <StackHeader title="Profil" backHref="/portal/more" />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={uploadPhoto}
        className="hidden"
      />

      {profile ? (
        <Card className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="relative"
            aria-label="Rasmni o'zgartirish"
          >
            <Avatar src={profile.photo} name={name} size={96} />
            <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-coral-500 text-white">
              {busy ? (
                <CircleNotch size={15} weight="bold" className="animate-spin" />
              ) : (
                <Camera size={15} weight="fill" />
              )}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <h2 className="font-display text-[22px] font-extrabold text-ink-900">
              {name}
            </h2>
            <button
              type="button"
              onClick={() => setNameOpen(true)}
              aria-label="Ism va familiyani o'zgartirish"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
            >
              <PencilSimple size={15} weight="bold" />
            </button>
          </div>

          <StudentIdCopy id={profile.id} />

          {profile.photo ? (
            <button
              type="button"
              onClick={deletePhoto}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-danger disabled:opacity-50"
            >
              <Trash size={16} weight="bold" />
              Rasmni o&apos;chirish
            </button>
          ) : null}

          <div className="w-full">
            <InfoRow label="Telefon" value={formatPhone(profile.phone)} />
            {extraRow ? (
              <div className="border-b border-line py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-ink-500">
                    Zaxira raqam
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <span className="truncate text-right font-display font-bold text-ink-900">
                      {extraRow.value}
                    </span>
                    {extraRow.actions.includes("add") ? (
                      <button
                        type="button"
                        onClick={() => openExtraPhone("set")}
                        aria-label="Zaxira raqam qo'shish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
                      >
                        <Plus size={15} weight="bold" />
                      </button>
                    ) : null}
                    {extraRow.actions.includes("change") ? (
                      <button
                        type="button"
                        onClick={() => openExtraPhone("set")}
                        aria-label="Zaxira raqamni o'zgartirish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
                      >
                        <PencilSimple size={15} weight="bold" />
                      </button>
                    ) : null}
                    {extraRow.actions.includes("remove") ? (
                      <button
                        type="button"
                        onClick={() => openExtraPhone("remove")}
                        aria-label="Zaxira raqamni o'chirish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-danger transition-colors hover:bg-tint"
                      >
                        <Trash size={15} weight="bold" />
                      </button>
                    ) : null}
                  </span>
                </div>
                {extraRow.note ? (
                  <p className="mt-1 text-xs font-semibold text-ink-500">
                    {extraRow.note}
                  </p>
                ) : null}
              </div>
            ) : null}
            <InfoRow label="Login" value={profile.login} />
            <InfoRow label="Telegram" value={profile.telegram} />
            <InfoRow label="Filial" value={branchNames} last />
          </div>
        </Card>
      ) : null}

      <StudentNameDialog open={nameOpen} onOpenChange={setNameOpen} />
      <StudentExtraPhoneDialog
        open={extraPhoneOpen}
        onOpenChange={setExtraPhoneOpen}
        mode={extraPhoneMode}
      />
    </Screen>
  );
}
