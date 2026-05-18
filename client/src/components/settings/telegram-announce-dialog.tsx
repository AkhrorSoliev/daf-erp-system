"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2, Megaphone } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

type TemplateKey =
  | "NEW_PAYMENT_METHOD"
  | "NEW_REPORT"
  | "BUG_FIX"
  | "GENERAL"
  | "CUSTOM";

interface TemplateDef {
  label: string;
  body: string;
  vars: string[];
}

const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  NEW_PAYMENT_METHOD: {
    label: "Yangi to'lov usuli",
    body: "🎉 Yangi to'lov usuli: {{name}}\n\nEndi siz {{name}} orqali ham to'lovlarni qabul qila olasiz. Tafsilotlar admin panelda.",
    vars: ["name"],
  },
  NEW_REPORT: {
    label: "Yangi hisobot",
    body: '📊 Yangi hisobot: "{{name}}"\n\n{{description}}\n\nKo\'rish: admin.dafzentrum.uz/reports',
    vars: ["name", "description"],
  },
  BUG_FIX: {
    label: "Xato tuzatildi",
    body: "🛠 Tuzatildi: {{summary}}\n\nEndi tizim to'g'ri ishlamoqda.",
    vars: ["summary"],
  },
  GENERAL: {
    label: "Umumiy e'lon",
    body: "✨ Yangilik: {{title}}\n\n{{body}}",
    vars: ["title", "body"],
  },
  CUSTOM: {
    label: "Maxsus matn",
    body: "",
    vars: [],
  },
};

export function TelegramAnnounceDialog() {
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("GENERAL");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [customMessage, setCustomMessage] = useState("");

  const def = TEMPLATES[templateKey];

  const preview = useMemo(() => {
    if (templateKey === "CUSTOM") return customMessage;
    return def.body.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      variables[k] ? variables[k] : `[?${k}?]`,
    );
  }, [templateKey, variables, customMessage, def.body]);

  const announceMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      api
        .post<{ recipientCount: number; sentCount: number; dryRun: boolean }>(
          "/telegram-groups/announce",
          templateKey === "CUSTOM"
            ? { customMessage, dryRun }
            : { templateKey, variables, dryRun },
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      if (data.dryRun) {
        toast.success(
          `Preview tayyor — ${data.recipientCount} ta guruhga yuboriladi`,
        );
      } else {
        toast.success(
          `E'lon yuborildi: ${data.sentCount}/${data.recipientCount} ta guruh`,
        );
        setOpen(false);
        setVariables({});
        setCustomMessage("");
      }
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "E'lon yuborishda xatolik"));
    },
  });

  const isReady =
    templateKey === "CUSTOM"
      ? customMessage.trim().length > 0
      : def.vars.every((v) => (variables[v] ?? "").trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Megaphone className="size-4 mr-2" />
          Yangi e&apos;lon
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Feature e&apos;loni yuborish</DialogTitle>
          <DialogDescription>
            Barcha tasdiqlangan Telegram guruhlarga bir martalik xabar.
            Avval &quot;Ko&apos;rib chiqish&quot; tugmasi bilan tekshiring.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Shablon</Label>
            <Select
              value={templateKey}
              onValueChange={(v) => {
                setTemplateKey(v as TemplateKey);
                setVariables({});
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <SelectItem key={k} value={k}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templateKey === "CUSTOM" ? (
            <div className="space-y-2">
              <Label>Matn</Label>
              <Textarea
                placeholder="E'lon matni..."
                rows={5}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {customMessage.length} / 2000
              </p>
            </div>
          ) : (
            def.vars.map((v) => (
              <div key={v} className="space-y-2">
                <Label className="capitalize">{v}</Label>
                <Input
                  placeholder={v}
                  value={variables[v] ?? ""}
                  onChange={(e) =>
                    setVariables((p) => ({ ...p, [v]: e.target.value }))
                  }
                />
              </div>
            ))
          )}

          <div className="space-y-2">
            <Label>Ko&apos;rinish (preview)</Label>
            <div className="rounded border bg-muted/40 p-3 text-sm whitespace-pre-wrap min-h-24">
              {preview || (
                <span className="text-muted-foreground">
                  Maydonlarni to&apos;ldiring...
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={announceMutation.isPending}>
              Bekor qilish
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            disabled={!isReady || announceMutation.isPending}
            onClick={() => announceMutation.mutate(true)}
          >
            {announceMutation.isPending && announceMutation.variables === true && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            Ko&apos;rib chiqish
          </Button>
          <Button
            disabled={!isReady || announceMutation.isPending}
            onClick={() => announceMutation.mutate(false)}
          >
            {announceMutation.isPending && announceMutation.variables === false && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            Yuborish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
