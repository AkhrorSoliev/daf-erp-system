"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Camera, KeyRound, UserPen, Loader2, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { StudentPortalFooter } from "./student-portal-footer";

export function StudentSettingsPage() {
  const user = useAuth((s) => s.user);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-lg font-bold">Sozlamalar</h1>

      <PhotoSection />
      <NameSection />
      <PasswordSection />

      <StudentPortalFooter />
    </div>
  );
}

function PhotoSection() {
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: loading } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });
  const photo = profile?.photo ?? user?.photo ?? null;

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`
    : "?";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await api.post("/student-portal/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      queryClient.setQueryData(["student-portal", "profile"], (old: any) =>
        old ? { ...old, photo: res.data.photo } : old
      );
      toast.success("Rasm muvaffaqiyatli yangilandi");
    } catch (err) {
      toast.error((err as any)?.response?.data?.message || "Rasmni yuklashda xatolik");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <AvatarWithPreview src={photo} alt="Profil rasmi">
            <Avatar className="size-16">
              <AvatarImage src={photo ?? undefined} />
              <AvatarFallback className="text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </AvatarWithPreview>
          {(loading || uploading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
              <Loader2 className="size-5 text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Profil rasmi</p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG. Maksimal 5MB
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Camera className="size-4 mr-1.5" />
          O'zgartirish
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

function NameSection() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => api.get("/student-portal/profile").then((r) => r.data),
  });

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
      const res = await api.patch("/student-portal/name", { firstName: firstName.trim(), lastName: lastName.trim() });
      queryClient.setQueryData(["student-portal", "profile"], (old: any) =>
        old ? { ...old, firstName: res.data.firstName, lastName: res.data.lastName } : old
      );
      toast.success("Ism va familya yangilandi");
      setOpen(false);
    } catch (err) {
      toast.error((err as any)?.response?.data?.message || "Saqlashda xatolik");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="w-full rounded-lg border bg-card p-4 flex items-center gap-3 hover:bg-accent transition-colors text-left"
      >
        <UserPen className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Ism va familya</p>
          <p className="text-xs text-muted-foreground">
            {profile?.firstName ?? "—"} {profile?.lastName ?? ""}
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ism va familya</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ism</label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ismingiz"
                minLength={2}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Familya</label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Familyangiz"
                minLength={2}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
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
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function reset() {
    setOldPassword("");
    setNewPassword("");
    setShowOld(false);
    setShowNew(false);
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
      toast.error((err as any)?.response?.data?.message || "Parolni o'zgartirishda xatolik");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border bg-card p-4 flex items-center gap-3 hover:bg-accent transition-colors text-left"
      >
        <KeyRound className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Parolni o'zgartirish</p>
          <p className="text-xs text-muted-foreground">
            Login va parol sozlamalari
          </p>
        </div>
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Parolni o'zgartirish</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Joriy parol</label>
              <div className="relative">
                <Input
                  type={showOld ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Joriy parolingiz"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOld ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Yangi parol</label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Kamida 6 ta belgi"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
