"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { SegmentedControl } from "../lumio";
import { CHAT_KEYS } from "./chat-queries";
import type { ChatFindWho, ChatMe, ChatPrivacy, ChatWho } from "./chat-types";

const WHO: { value: ChatWho; label: string }[] = [
  { value: "EVERYONE", label: msg("Hamma") },
  { value: "GROUPMATES", label: msg("Guruhdoshlar") },
  { value: "NOBODY", label: msg("Hech kim") },
];
const FIND: { value: ChatFindWho; label: string }[] = [
  { value: "EVERYONE", label: msg("Hamma") },
  { value: "NOBODY", label: msg("Hech kim") },
];

/** Each change sends only its own field; the cache moves first and rolls back on failure. */
function usePrivacyChange() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<
    unknown,
    unknown,
    Partial<ChatPrivacy>,
    { before: ChatMe | undefined }
  >({
    mutationFn: (patch) => api.patch("/chat/privacy", patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: CHAT_KEYS.me });
      const before = qc.getQueryData<ChatMe>(CHAT_KEYS.me);
      qc.setQueryData<ChatMe>(CHAT_KEYS.me, (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { before };
    },
    onError: (err, patch, ctx) => {
      // Roll back only the field that failed, so a newer change stays.
      const key = Object.keys(patch)[0] as keyof ChatPrivacy;
      qc.setQueryData<ChatMe>(CHAT_KEYS.me, (old) =>
        old && ctx?.before ? { ...old, [key]: ctx.before[key] } : old,
      );
      toast.error(getErrorMessage(err, t("Saqlab bo'lmadi")));
    },
  });
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-sm font-bold text-ink-700">{title}</p>
      {children}
      {hint ? <p className="px-1 text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function PrivacyForm({ me }: { me: ChatMe }) {
  const t = useT();
  const change = usePrivacyChange();
  const who = WHO.map((o) => ({ value: o.value, label: t(o.label) }));
  const find = FIND.map((o) => ({ value: o.value, label: t(o.label) }));
  return (
    <div className="flex flex-col gap-5">
      <Row title={t("Kim menga yozishi mumkin")}>
        <SegmentedControl
          options={who}
          value={me.whoCanWrite}
          onChange={(v) => change.mutate({ whoCanWrite: v })}
        />
      </Row>
      <Row
        title={t("Meni ism bo'yicha kim topadi")}
        hint={t("@nom bo'yicha baribir topiladi")}
      >
        <SegmentedControl
          options={find}
          value={me.whoCanFind}
          onChange={(v) => change.mutate({ whoCanFind: v })}
        />
      </Row>
      <Row title={t("Rasmimni kim ko'radi")}>
        <SegmentedControl
          options={who}
          value={me.whoSeesPhoto}
          onChange={(v) => change.mutate({ whoSeesPhoto: v })}
        />
      </Row>
    </div>
  );
}
