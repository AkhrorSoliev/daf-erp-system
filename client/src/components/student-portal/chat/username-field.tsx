"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { Button, Input } from "../lumio";
import { CHAT_KEYS } from "./chat-queries";
import type { ChatMe } from "./chat-types";
import { normalizeUsername, validateUsername } from "./chat-username-rules";

/** PUT /chat/username; the server's refusal (e.g. «band») shows under the field. */
export function UsernameField({ current }: { current: string | null }) {
  const t = useT();
  const qc = useQueryClient();
  const [value, setValue] = useState(current ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);

  const problem = value.trim() === "" ? null : validateUsername(value, t);
  const normalized = normalizeUsername(value);
  const unchanged = normalized === (current ?? "");

  const save = useMutation<{ username: string }, unknown, string>({
    mutationFn: (username) =>
      api.put("/chat/username", { username }).then((r) => r.data),
    onSuccess: (data) => {
      setRefusal(null);
      setValue(data.username);
      qc.setQueryData<ChatMe>(CHAT_KEYS.me, (old) =>
        old ? { ...old, username: data.username } : old,
      );
      toast.success(t("Foydalanuvchi nomi saqlandi"));
    },
    onError: (err) =>
      setRefusal(getErrorMessage(err, t("Saqlab bo'lmadi"))),
  });

  const blocked =
    value.trim() === "" || problem !== null || unchanged || save.isPending;
  const message = problem ?? refusal;

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) save.mutate(normalized);
      }}
    >
      <Input
        addon="@"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setRefusal(null);
        }}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={40}
        aria-invalid={message !== null}
        aria-label={t("Foydalanuvchi nomi")}
      />
      <p
        className={message ? "px-1 text-sm font-semibold text-danger" : "px-1 text-sm text-ink-500"}
        role={message ? "alert" : undefined}
      >
        {message ?? t("Boshqalar sizni shu nom bilan topadi")}
      </p>
      <Button type="submit" block loading={save.isPending} disabled={blocked}>
        {t("Saqlash")}
      </Button>
    </form>
  );
}
