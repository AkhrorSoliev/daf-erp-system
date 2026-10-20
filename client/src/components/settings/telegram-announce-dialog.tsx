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
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
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

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  NEW_PAYMENT_METHOD: {
    label: msg("Yangi to'lov usuli"),
    body: "🎉 Yangi to'lov usuli: {{name}}\n\nEndi siz {{name}} orqali ham to'lovlarni qabul qila olasiz. Tafsilotlar admin panelda.",
    vars: ["name"],
  },
  NEW_REPORT: {
    label: msg("Yangi hisobot"),
    body: '📊 Yangi hisobot: "{{name}}"\n\n{{description}}\n\nKo\'rish: admin.dafzentrum.uz/reports',
    vars: ["name", "description"],
  },
  BUG_FIX: {
    label: msg("Xato tuzatildi"),
    body: "🛠 Tuzatildi: {{summary}}\n\nEndi tizim to'g'ri ishlamoqda.",
    vars: ["summary"],
  },
  GENERAL: {
    label: msg("Umumiy e'lon"),
    body: "✨ Yangilik: {{title}}\n\n{{body}}",
    vars: ["title", "body"],
  },
  CUSTOM: {
    label: msg("Maxsus matn"),
    body: "",
    vars: [],
  },
};

// A template's variable names are the keys sent to the server, so they stay
// English; the admin reads these words in the form and in the preview instead.
// A key without a label shows as itself.
export const VAR_LABELS: Record<string, string> = {
  name: msg("Nomi"),
  description: msg("Tavsif"),
  summary: msg("Qisqacha mazmuni"),
  title: msg("Sarlavha"),
  body: msg("Matn"),
};

// The template bodies above are the message the groups receive: they stay
// Uzbek. Only the dialog around them follows the page language.
const varLabel = (key: string, t: (source: string) => string) => {
  const label = VAR_LABELS[key];
  return label ? t(label) : key;
};

export function TelegramAnnounceDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("GENERAL");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [customMessage, setCustomMessage] = useState("");

  const def = TEMPLATES[templateKey];

  const preview = useMemo(() => {
    if (templateKey === "CUSTOM") return customMessage;
    return def.body.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      variables[k] ? variables[k] : `[?${varLabel(k, t)}?]`,
    );
  }, [templateKey, variables, customMessage, def.body, t]);

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
          t("Ko'rinish tayyor — {n} ta guruhga yuboriladi", { n: data.recipientCount }),
        );
      } else {
        toast.success(
          t("E'lon yuborildi: {sent}/{total} ta guruh", {
            sent: data.sentCount,
            total: data.recipientCount,
          }),
        );
        setOpen(false);
        setVariables({});
        setCustomMessage("");
      }
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, t("E'lon yuborishda xatolik")));
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
          {t("Yangi e'lon")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Yangilik e'loni yuborish")}</DialogTitle>
          <DialogDescription>
            {t(
              "Barcha tasdiqlangan Telegram guruhlarga bir martalik xabar. Avval \"Ko'rib chiqish\" tugmasi bilan tekshiring.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Shablon")}</Label>
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
                {Object.entries(TEMPLATES).map(([k, tpl]) => (
                  <SelectItem key={k} value={k}>
                    {t(tpl.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templateKey === "CUSTOM" ? (
            <div className="space-y-2">
              <Label>{t("Matn")}</Label>
              <Textarea
                placeholder={t("E'lon matni...")}
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
                <Label>{varLabel(v, t)}</Label>
                <Input
                  placeholder={varLabel(v, t)}
                  value={variables[v] ?? ""}
                  onChange={(e) =>
                    setVariables((p) => ({ ...p, [v]: e.target.value }))
                  }
                />
              </div>
            ))
          )}

          <div className="space-y-2">
            <Label>{t("Ko'rinish (namuna)")}</Label>
            <div className="rounded border bg-muted/40 p-3 text-sm whitespace-pre-wrap min-h-24">
              {preview || (
                <span className="text-muted-foreground">
                  {t("Maydonlarni to'ldiring...")}
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={announceMutation.isPending}>
              {t("Bekor qilish")}
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
            {t("Ko'rib chiqish")}
          </Button>
          <Button
            disabled={!isReady || announceMutation.isPending}
            onClick={() => announceMutation.mutate(false)}
          >
            {announceMutation.isPending && announceMutation.variables === false && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            {t("Yuborish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
