"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/context";
import { SeansEkrani } from "@/components/student-portal/lernen/uebung/seans-ekrani";
import { useMediaPleyer } from "./media-pleyer";

/**
 * «O'quvchi kabi o'tib ko'rish»: o'quvchining seans ekrani, butun ekran.
 * Radix `Dialog` EMAS — uning `transform`i seans ekranining `fixed`
 * pastki panelini dialog ichiga qamab qo'yadi. `body`ga portal, `.lumio`
 * shu ildizda (o'quvchi portali tokenlari).
 */
export function MediaSinovQatlami({ lessonId, onYop }: { lessonId: number; onYop: () => void }) {
  const t = useT();
  const [ildiz, setIldiz] = React.useState<HTMLElement | null>(null);
  const ildizRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setIldiz(document.body);
    useMediaPleyer.getState().toxtatish();
    const body = document.body;
    const oldingiOverflow = body.style.overflow;
    body.dataset.mediaSinov = "1";
    body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => {
      // Yozish maydonida Esc (masalan IME taklifini yopish) qatlamni yopmasin.
      const el = e.target;
      const yozish =
        el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "Escape" && !yozish) onYop();
    };
    window.addEventListener("keydown", esc);
    return () => {
      delete body.dataset.mediaSinov;
      body.style.overflow = oldingiOverflow;
      window.removeEventListener("keydown", esc);
    };
  }, [onYop]);

  // aria-modal: fokus qatlamga, orqadagi sahifa `inert`, yopilganda fokus joyiga qaytadi.
  React.useEffect(() => {
    if (!ildiz) return;
    const oldingi = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertlangan = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== ildizRef.current && !el.inert,
    );
    for (const el of inertlangan) el.inert = true;
    ildizRef.current?.focus();
    return () => {
      for (const el of inertlangan) el.inert = false;
      oldingi?.focus();
    };
  }, [ildiz]);

  if (!ildiz) return null;
  return createPortal(
    <div
      ref={ildizRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t("Sinov rejimi")}
      className="lumio fixed inset-0 z-50 overflow-y-auto bg-background text-foreground antialiased outline-none"
    >
      <div className="sticky top-0 z-30 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        {t("Sinov rejimi — javoblar saqlanmaydi")}
      </div>
      <SeansEkrani manba="korik" lessonId={lessonId} onChiqish={onYop} />
    </div>,
    ildiz,
  );
}
