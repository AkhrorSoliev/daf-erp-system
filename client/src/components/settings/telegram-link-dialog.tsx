"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  Crown,
  GraduationCap,
  Link2,
  Loader2,
  Shield,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";

function extractError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  if (typeof msg === "string") return msg;
  return fallback;
}

const ROLES = [
  { id: 1, label: "CEO", icon: Crown },
  { id: 2, label: "Direktor", icon: Building2 },
  { id: 3, label: "Administrator", icon: Shield },
  { id: 4, label: "O'qituvchi", icon: GraduationCap },
  { id: 5, label: "Kassir", icon: Wallet },
];

interface TelegramLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramLinkDialog({ open, onOpenChange }: TelegramLinkDialogProps) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [link, setLink] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setRoleIds([]);
      setLink("");
      setCopied(false);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    setLink("");
    setCopied(false);
  }, [roleIds, selectedBranch?.id]);

  const toggleRole = (roleId: number) => {
    setRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

  const handleGenerate = async () => {
    if (!selectedBranch || roleIds.length === 0) return;
    setLoading(true);
    try {
      const { data } = await api.post<{ payload: string }>(
        "/telegram/employee-link",
        { branchId: selectedBranch.id, roleIds },
      );
      const url = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}?start=${data.payload}`;
      setLink(url);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Havola yaratildi va nusxalandi");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(extractError(err, "Havola yaratishda xatolik"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Havola nusxalandi");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Telegram ro&apos;yxatdan o&apos;tish havolasi</DialogTitle>
          <DialogDescription>
            Yangi xodim tanlangan lavozim(lar) bilan Telegram bot orqali
            ro&apos;yxatdan o&apos;tadi. Havola doimiy ishlaydi va imzolangan
            bo&apos;ladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Filial</Label>
            <p className="mt-1 text-sm font-medium">
              {selectedBranch?.name ?? "Filial tanlanmagan"}
            </p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Lavozim(lar)
            </Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ROLES.map((role) => {
                const isChecked = roleIds.includes(role.id);
                const Icon = role.icon;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      isChecked
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:bg-muted"
                    }`}
                  >
                    {isChecked ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <Icon className="size-4 text-muted-foreground" />
                    )}
                    <span>{role.label}</span>
                  </button>
                );
              })}
            </div>
            {roleIds.length === 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Kamida bitta lavozim tanlang
              </p>
            )}
          </div>

          {link && (
            <div>
              <Label className="text-xs text-muted-foreground">Havola</Label>
              <div className="mt-1 flex gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!selectedBranch || roleIds.length === 0 || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 size-4" />
            )}
            {link ? "Havolani qayta yaratish" : "Havola yaratish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
