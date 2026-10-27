"use client";

import * as React from "react";
import { SpeakerHigh } from "@phosphor-icons/react";
import { Button, Input } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useClipPlayer } from "../use-clip-player";
import type { JangSavoli } from "../types";

/**
 * Bitta jang savoli. `bloklangan` — javob yuborilgan, natija kutilmoqda.
 * Ota komponent `key={pozitsiya}` beradi: har savol yangi holat bilan ochiladi
 * (effect ichida `setState` bilan tozalash shart emas).
 */
export function SavolKorinishi({
  savol,
  bloklangan,
  onJavob,
}: {
  savol: JangSavoli;
  bloklangan: boolean;
  onJavob: (javob: string) => void;
}) {
  const t = useT();
  const [matn, setMatn] = React.useState("");
  const play = useClipPlayer(savol.audio);

  React.useEffect(() => {
    if (savol.kind === "LISTEN") play();
    // Faqat savol ochilganda bir marta o'ynaydi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="font-display text-xl font-extrabold text-ink-900">{savol.prompt}</p>
      {savol.kind === "LISTEN" ? (
        <Button variant="secondary" onClick={play} aria-label={t("Qayta eshitish")}>
          <SpeakerHigh size={22} weight="bold" />
        </Button>
      ) : null}
      {savol.kind === "TYPE" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (matn.trim()) onJavob(matn.trim());
          }}
        >
          <Input
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={matn}
            onChange={(e) => setMatn(e.target.value)}
            disabled={bloklangan}
            aria-label={t("Javob")}
          />
          <Button type="submit" block disabled={bloklangan || !matn.trim()}>
            {t("Tekshirish")}
          </Button>
        </form>
      ) : (
        <div className="grid gap-3">
          {savol.options.map((o) => (
            <Button
              key={o}
              variant="secondary"
              block
              className="h-auto min-h-[52px] whitespace-normal py-3"
              disabled={bloklangan}
              onClick={() => onJavob(o)}
            >
              {o}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
