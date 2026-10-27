"use client";

import * as React from "react";
import axios from "axios";
import Link from "next/link";
import { Avatar, Button, Card, Screen, StackHeader, lumioButton } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useJangBoshla, useJangJavob, useJangYakun } from "../queries";
import { nishonNomi } from "../nishon";
import { JAVOB_KORISH_MS, SAVOL_MS, jangReducer } from "./jang-holati";
import { SavolKorinishi } from "./savol-korinishi";
import type { JangRaqibi } from "../types";

function RaqibKartasi({ raqib }: { raqib: JangRaqibi }) {
  const t = useT();
  const ism = raqib.tur === "BOT" ? t("Dafi bot") : raqib.ism;
  return (
    <Card className="flex items-center gap-3">
      <Avatar src={raqib.rasm} name={ism} size={48} />
      <div className="min-w-0 text-left">
        <p className="truncate font-display font-extrabold text-ink-900">{ism}</p>
        {raqib.golibSoni !== null ? (
          <p className="text-sm text-ink-500">{t("{n} ta g'alaba", { n: raqib.golibSoni })}</p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * 10 soniyalik ko'rinadigan chiziq. Faqat ko'rsatish uchun — vaqtni server o'lchaydi.
 * Ota komponent `key={`t-${pozitsiya}`}` beradi (SavolKorinishi bilan aka-uka, shuning uchun kalit boshqacha): har savolda chiziq to'lib, qaytadan boshlanadi.
 */
function VaqtChizigi() {
  const [bosh, setBosh] = React.useState(false);
  React.useEffect(() => {
    // Ikki kadr: avval 100% chizilsin, keyin 0% ga silliq o'tsin.
    let ikkinchi = 0;
    const birinchi = requestAnimationFrame(() => {
      ikkinchi = requestAnimationFrame(() => setBosh(true));
    });
    return () => {
      cancelAnimationFrame(birinchi);
      cancelAnimationFrame(ikkinchi);
    };
  }, []);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunk" aria-hidden>
      <div
        className="h-full rounded-full bg-coral-500"
        style={{ width: bosh ? "0%" : "100%", transition: `width ${SAVOL_MS}ms linear` }}
      />
    </div>
  );
}

/** Jang to'xtab qolganda (javob 400/409/tarmoq xatosi) o'yinchi qotib qolmasin. */
function XatoKarta({ matn, qaytaUrinish }: { matn: string; qaytaUrinish?: () => void }) {
  const t = useT();
  return (
    <Card className="space-y-3 text-center">
      <p className="font-display font-extrabold text-ink-900">{matn}</p>
      {qaytaUrinish ? (
        <Button block onClick={qaytaUrinish}>
          {t("Qayta urinish")}
        </Button>
      ) : null}
      <Link href="/portal/lernen" className={lumioButton({ block: true })}>
        {t("Qaytish")}
      </Link>
    </Card>
  );
}

export function JangEkrani() {
  const t = useT();
  const [h, dispatch] = React.useReducer(jangReducer, null);
  const boshla = useJangBoshla();
  const javob = useJangJavob();
  const yakun = useJangYakun();

  // Kirish ekrani → birinchi savol.
  React.useEffect(() => {
    if (h?.tur !== "kirish") return;
    const id = setTimeout(() => dispatch({ tur: "kirish-tugadi" }), h.jang.kirishMs);
    return () => clearTimeout(id);
  }, [h]);

  // `javob.isPending` keyingi renderdagina ko'rinadi: javob bosilishi bilan 10 soniya taymeri
  // bir-biriga yaqin kelsa, ikkala yo'l ham yuborib yuborardi (server 409 → "Jang to'xtadi").
  // Shuning uchun har (jang, savol) uchun BIR marta yuborish sinxron ref bilan belgilanadi.
  const yuborilganRef = React.useRef<string | null>(null);

  const yubor = React.useCallback(
    (berilgan: string) => {
      if (h?.tur !== "savol" || javob.isPending || javob.isError) return;
      const kalit = `${h.jang.jangId}:${h.pozitsiya}`;
      if (yuborilganRef.current === kalit) return;
      yuborilganRef.current = kalit;
      javob.mutate(
        { jangId: h.jang.jangId, pozitsiya: h.pozitsiya, javob: berilgan },
        { onSuccess: (natija) => dispatch({ tur: "javob-keldi", natija, berilgan }) },
      );
    },
    [h, javob],
  );

  // `yubor` har render yangilanadi (mutation obyekti o'zgaradi); taymer esa faqat
  // yangi savolda qayta boshlanishi kerak — shuning uchun ref orqali.
  const yuborRef = React.useRef(yubor);
  React.useEffect(() => {
    yuborRef.current = yubor;
  });

  // 10 soniya taymer: vaqt tugasa bo'sh javob yuboriladi (server baribir o'zi o'lchaydi).
  React.useEffect(() => {
    if (h?.tur !== "savol") return;
    const id = setTimeout(() => yuborRef.current(""), SAVOL_MS);
    return () => clearTimeout(id);
  }, [h]);

  React.useEffect(() => {
    if (h?.tur !== "javob") return;
    const id = setTimeout(() => dispatch({ tur: "keyingi" }), JAVOB_KORISH_MS);
    return () => clearTimeout(id);
  }, [h]);

  // Har jang aniq bir marta yakunlanadi (jangId bo'yicha). `yakun.isIdle` ga tayanib bo'lmaydi:
  // "Yana jang" dan keyin u eski jang natijasini ushlab turadi va yangi jang yakunlanmay qolardi.
  const yakunlanganRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (h?.tur !== "tugadi" || yakunlanganRef.current === h.jang.jangId) return;
    yakunlanganRef.current = h.jang.jangId;
    yakun.mutate(h.jang.jangId);
  }, [h, yakun]);

  // Yakunlash xato bersa o'sha jang qayta yakunlanadi (server `yakun` takror chaqirishga chidamli).
  const yakunniQaytar = () => {
    yakunlanganRef.current = null;
    yakun.reset();
  };

  // Eski mutatsiyalar faqat yangi jang BOSHLANGANDAN keyin tozalanadi: aks holda
  // tugagan jang ekranida eski jang qayta yakunlanardi.
  const boshlash = () =>
    boshla.mutate(undefined, {
      onSuccess: (jang) => {
        yakun.reset();
        javob.reset();
        dispatch({ tur: "boshlandi", jang });
      },
    });

  // 400 — "kunlik limit tugadi", 409 — tasdiqlangan savollar yetmaydi; boshqa xato (tarmoq) — umumiy.
  const boshlaStatus = axios.isAxiosError(boshla.error) ? boshla.error.response?.status : undefined;
  const boshlaXato = boshla.isError
    ? boshlaStatus === 400
      ? t("Bugungi janglar tugadi")
      : boshlaStatus === 409
        ? t("Jang savollari hali tayyor emas")
        : t("Jangni boshlab bo'lmadi")
    : null;

  return (
    <Screen narrow>
      <StackHeader title={t("Jang")} backHref="/portal/lernen" />
      {!h ? (
        <Card className="space-y-3 text-center">
          <p className="text-ink-700">{t("6 savol, har biriga 10 soniya")}</p>
          <Button block onClick={boshlash} disabled={boshla.isPending}>
            {t("Jangni boshlash")}
          </Button>
          {boshlaXato ? <p className="text-sm text-danger">{boshlaXato}</p> : null}
        </Card>
      ) : h.tur === "kirish" ? (
        <div className="space-y-3 text-center">
          <p className="text-ink-500">{t("Raqibingiz")}</p>
          <RaqibKartasi raqib={h.jang.raqib} />
        </div>
      ) : h.tur === "savol" || h.tur === "javob" ? (
        javob.isError ? (
          <XatoKarta matn={t("Jang to'xtadi")} />
        ) : (
          <div className="space-y-4">
            <p className="text-center font-display font-extrabold text-ink-700">
              {t("{n}-savol", { n: h.pozitsiya + 1 })} · {h.hisob.men} : {h.hisob.raqib}
            </p>
            {h.tur === "savol" ? <VaqtChizigi key={`t-${h.pozitsiya}`} /> : <div className="h-2" aria-hidden />}
            <SavolKorinishi
              key={`s-${h.pozitsiya}`}
              savol={h.jang.savollar[h.pozitsiya]}
              bloklangan={h.tur === "javob" || javob.isPending}
              onJavob={yubor}
            />
            {h.tur === "javob" ? (
              <Card className="text-center">
                <p className="font-display font-extrabold">{h.natija.togri ? t("To'g'ri") : t("Noto'g'ri")}</p>
                {!h.natija.togri ? <p className="text-ink-700">{h.natija.togriJavob}</p> : null}
                <p className="text-sm text-ink-500">
                  {h.natija.raqib.togri ? t("Raqib to'g'ri topdi") : t("Raqib xato qildi")}
                </p>
              </Card>
            ) : null}
          </div>
        )
      ) : yakun.isError ? (
        <XatoKarta matn={t("Natijani hisoblab bo'lmadi")} qaytaUrinish={yakunniQaytar} />
      ) : (
        <div className="space-y-4 text-center">
          {yakun.data ? (
            <>
              <p className="font-display text-2xl font-extrabold text-ink-900">
                {yakun.data.natija === "WIN" ? t("G'alaba!") : yakun.data.natija === "LOSS" ? t("Mag'lubiyat") : t("Durang")}
              </p>
              <p className="text-ink-700">
                {yakun.data.men.togri} : {yakun.data.raqib.togri}
              </p>
              {yakun.data.yangiNishonlar.map((k) => (
                <p key={k} className="font-semibold">{t("Yangi nishon: {name}", { name: nishonNomi(k, t) })}</p>
              ))}
              {h.jang.raqib.tur === "GHOST" && h.jang.raqib.studentId ? (
                <Link href={`/portal/lernen/reyting/${h.jang.raqib.studentId}`} className="block">
                  <RaqibKartasi raqib={h.jang.raqib} />
                </Link>
              ) : (
                <RaqibKartasi raqib={h.jang.raqib} />
              )}
              <Button block onClick={boshlash} disabled={boshla.isPending}>
                {t("Yana jang")}
              </Button>
            </>
          ) : (
            <p className="text-ink-500">{t("Natija hisoblanmoqda…")}</p>
          )}
          {boshlaXato ? <p className="text-sm text-danger">{boshlaXato}</p> : null}
        </div>
      )}
    </Screen>
  );
}
