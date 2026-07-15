"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Camera,
  CircleNotch,
  IdentificationCard,
  Key,
  Sun,
  Moon,
  Desktop,
} from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Card,
  Button,
  Avatar,
  ListRow,
  SegmentedControl,
  Input,
  Field,
} from "./lumio";
import { useStudentProfile } from "./lib/queries";
import type { StudentProfile } from "./lib/types";

type ThemeMode = "system" | "light" | "dark";

const THEME_OPTIONS = [
  { value: "system" as const, label: "Tizim", icon: <Desktop size={16} weight="bold" /> },
  { value: "light" as const, label: "Yorug'", icon: <Sun size={16} weight="bold" /> },
  { value: "dark" as const, label: "Qorong'i", icon: <Moon size={16} weight="bold" /> },
];

export function StudentSettingsPage() {
  return (
    <Screen>
      <StackHeader title="Sozlamalar" backHref="/portal/more" />
      <ThemeSection />
      <PhotoSection />
      <NameSection />
      <PasswordSection />
    </Screen>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-base font-bold text-ink-900">Mavzu</h2>
      {mounted ? (
        <SegmentedControl<ThemeMode>
          options={THEME_OPTIONS}
          value={(theme as ThemeMode) ?? "system"}
          onChange={setTheme}
        />
      ) : (
        <div className="h-[52px] rounded-pill bg-sunk" />
      )}
    </Card>
  );
}

function PhotoSection() {
  const { data: profile } = useStudentProfile();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const name = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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

  return (
    <Card className="flex items-center gap-4">
      <div className="relative">
        <Avatar src={profile?.photo} name={name} size={56} />
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <CircleNotch size={20} weight="bold" className="animate-spin text-white" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold text-ink-900">Profil rasmi</p>
        <p className="text-xs font-semibold text-ink-500">JPG, PNG. Maksimal 5MB</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        iconBefore={<Camera size={16} weight="bold" />}
        onClick={() => fileRef.current?.click()}
      >
        O&apos;zgartirish
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </Card>
  );
}

function NameSection() {
  const { data: profile } = useStudentProfile();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  function openDialog() {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      const res = await api.patch("/student-portal/name", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      queryClient.setQueryData<StudentProfile>(
        ["student-portal", "profile"],
        (old) =>
          old
            ? { ...old, firstName: res.data.firstName, lastName: res.data.lastName }
            : old,
      );
      toast.success("Ism va familya yangilandi");
      setOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ListRow
        icon={<IdentificationCard weight="bold" />}
        iconTone="sky"
        label="Ism va familya"
        subtitle={`${profile?.firstName ?? "—"} ${profile?.lastName ?? ""}`.trim()}
        onClick={openDialog}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="lumio sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold">
              Ism va familya
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Ism">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ismingiz"
                minLength={2}
                required
              />
            </Field>
            <Field label="Familya">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Familyangiz"
                minLength={2}
                required
              />
            </Field>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Bekor qilish
              </Button>
              <Button type="submit" loading={loading}>
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function reset() {
    setOldPassword("");
    setNewPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    setLoading(true);
    try {
      await api.patch("/student-portal/password", { oldPassword, newPassword });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err, "Parolni o'zgartirishda xatolik"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ListRow
        icon={<Key weight="bold" />}
        iconTone="amber"
        label="Parolni o'zgartirish"
        subtitle="Login va parol sozlamalari"
        onClick={() => setOpen(true)}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="lumio sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold">
              Parolni o&apos;zgartirish
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Joriy parol">
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Joriy parolingiz"
                required
              />
            </Field>
            <Field label="Yangi parol">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Kamida 6 ta belgi"
                minLength={6}
                required
              />
            </Field>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Bekor qilish
              </Button>
              <Button type="submit" loading={loading}>
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
