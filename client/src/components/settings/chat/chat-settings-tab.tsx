"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { useChatAdminSettings, useSaveChatAdminSettings } from "./chat-admin-queries";
import type { ChatAdminSettings } from "./chat-admin-types";
import { draftError, draftPatch, isDirty, toDraft, type ChatSettingsDraft } from "./chat-settings-draft";
import { FormError, SettingsCard, SettingsSaveBar, UnitNumberField } from "../settings-form-parts";

// JS strings, not JSX text: a JSX chunk with an entity AND a line break loses the space before the break (SWC bug, Next 16.2).
const LOAD_FAILED = msg("Sozlamalarni yuklab bo'lmadi.");
const MINUTES_HINT = msg("Shundan kam bo'lsa o'quvchi chatga yoza olmaydi, o'qiy oladi");

export function ChatSettingsTab() {
  const t = useT();
  const { data, isError, isFetching, refetch } = useChatAdminSettings();

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t(LOAD_FAILED)}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          {t("Qayta urinish")}
        </Button>
      </div>
    );
  }
  if (!data) return <Skeleton className="h-56 w-full max-w-xl" />;
  return <ChatSettingsForm saved={data} />;
}

function ChatSettingsForm({ saved }: { saved: ChatAdminSettings }) {
  const t = useT();
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<ChatSettingsDraft | null>(null);
  const [confirming, setConfirming] = useState(false);
  const save = useSaveChatAdminSettings(() => setDraft(null));

  const form = draft ?? toDraft(saved);
  const dirty = isDirty(saved, form);
  const error = dirty ? draftError(form, t) : null;
  const patch = dirty && !error ? draftPatch(saved, form) : null;
  const switching = form.enabled !== saved.enabled;

  const send = () => {
    setConfirming(false);
    if (patch) save.mutate(patch);
  };

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="chat-enabled">{t("Chat yoqilgan")}</Label>
          <p className="text-xs text-muted-foreground">{t("O'quvchilar o'zaro yozisha oladi")}</p>
        </div>
        <Switch
          id="chat-enabled"
          checked={form.enabled}
          disabled={save.isPending}
          onCheckedChange={(enabled) => setDraft({ ...form, enabled })}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <UnitNumberField
          id="chat-week-active"
          label={t("Oxirgi 7 kunda mashq")}
          unit={t("daqiqa")}
          hint={t(MINUTES_HINT)}
          value={form.active}
          onChange={(active) => setDraft({ ...form, active })}
        />
        <UnitNumberField
          id="chat-week-radio"
          label={t("Oxirgi 7 kunda radio")}
          unit={t("daqiqa")}
          hint={t(MINUTES_HINT)}
          value={form.radio}
          onChange={(radio) => setDraft({ ...form, radio })}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <SettingsSaveBar
        dirty={dirty}
        canSave={patch !== null}
        saving={save.isPending}
        onCancel={() => setDraft(null)}
        onSave={() => (switching ? setConfirming(true) : send())}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {form.enabled ? t("Chat hamma o'quvchilar uchun ochiladimi?") : t("Chat o'chirilsinmi?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {form.enabled
                ? t(
                    "Yoqilgandan keyin barcha o'quvchilar menyuda «Chat» bandini ko'radi va yozisha oladi. Shikoyatlar «Shikoyatlar» bo'limiga tushadi.",
                  )
                : t("Yozishmalar yopiladi, o'quvchilar chatni ko'rmaydi. Yozishmalar o'chmaydi.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction variant={form.enabled ? "default" : "destructive"} onClick={send}>
              {form.enabled ? t("Yoqish") : t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
