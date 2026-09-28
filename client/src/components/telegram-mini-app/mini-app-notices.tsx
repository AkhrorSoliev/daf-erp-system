"use client";

import type { ReactNode } from "react";
import { Button, Card } from "@/components/student-portal/lumio";
import {
  TelegramLogo,
  User,
  WarningCircle,
  X,
} from "@/components/student-portal/lumio/icon";
import {
  closeMiniApp,
  type MiniAppAudience,
} from "@/lib/telegram-mini-app";

/** Mini App kirishining bir holati: belgi, sarlavha, izoh va tugmalar. */
export function Notice({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="mb-1 inline-flex size-16 items-center justify-center rounded-full bg-sunk text-3xl text-ink-400">
        {icon}
      </span>
      <h1 className="font-display text-xl font-extrabold text-ink-900">
        {title}
      </h1>
      <p className="text-sm font-semibold text-ink-500">{description}</p>
      <div className="mt-2 w-full space-y-3">{children}</div>
    </div>
  );
}

export function CloseButton() {
  return (
    <Button
      block
      variant="ghost"
      iconBefore={<X weight="bold" />}
      onClick={closeMiniApp}
    >
      Yopish
    </Button>
  );
}

function BackToBotButton() {
  return (
    <Button
      block
      iconBefore={<TelegramLogo weight="fill" />}
      onClick={closeMiniApp}
    >
      Botga qaytish
    </Button>
  );
}

/**
 * Telegram akkaunt kabinet egasiga bog'lanmagan. Admin panelida Telegram'ni
 * bog'lash yo'q — bog'lash faqat botda, odam o'z raqamini yuborganda.
 */
export function NotRegisteredNotice({
  audience,
}: {
  audience: MiniAppAudience;
}) {
  if (audience === "staff") {
    return (
      <Notice
        icon={<WarningCircle weight="bold" />}
        title="Telegram akkauntingiz xodim hisobiga bog'lanmagan"
        description="Bu Telegram akkaunt hech bir DaF xodimining hisobiga bog'lanmagan."
      >
        {/* Bog'lash — botdagi /xodim (ADR-0045): o'z raqami hisobdagi
            telefonga teng bo'lsa, Telegram shu hisobga bog'lanadi. */}
        <Card
          pad="md"
          className="space-y-2 text-left text-sm font-semibold text-ink-700"
        >
          <p>
            Botga qayting va /xodim buyrug'ini yuboring, so'ng «📱 Telefon
            raqamni yuborish» orqali raqamingizni yuboring. Telegram'ingiz
            xodim hisobingizga bog'lanadi — kabinetni qayta oching.
          </p>
          <p className="text-ink-500">
            Tizimdagi raqamingiz Telegram raqamingizdan boshqa bo'lsa,
            administrator bilan bog'laning.
          </p>
        </Card>
        <BackToBotButton />
      </Notice>
    );
  }

  return (
    <Notice
      icon={<WarningCircle weight="bold" />}
      title="Telegram akkauntingiz ro'yxatdan o'tmagan"
      description="Bu Telegram akkaunt hech bir DaF o'quvchisiga bog'lanmagan."
    >
      {/* «To'lovlar» bog'lashni boshqa hech narsaga tegmasdan qiladi (parol
          tiklash esa parolni ham almashtiradi). */}
      <Card
        pad="md"
        className="space-y-2 text-left text-sm font-semibold text-ink-700"
      >
        <p>
          DaF o'quvchisi bo'lsangiz: botga qayting, «💳 To'lovlar» tugmasini
          bosing va «📱 Telefon raqamni yuborish» orqali raqamingizni
          yuboring. Akkauntingiz bog'lanadi — so'ng kabinetni qayta oching.
        </p>
        <p className="text-ink-500">
          Raqamingiz tizimda topilmasa, administrator bilan bog'laning.
        </p>
      </Card>
      <BackToBotButton />
    </Notice>
  );
}

/**
 * O'quvchi kabinetini xodim ochdi (eski xabardagi tugma). Uning kabineti
 * boshqa portalda — bot «Kabinet» tugmasini /start bilan yangilaydi.
 */
export function StaffAccountNotice() {
  return (
    <Notice
      icon={<User weight="bold" />}
      title="Siz xodim sifatida ro'yxatdan o'tgansiz"
      description="Bu — o'quvchilar kabineti. Botga qayting va /start bosing: «Kabinet» tugmasi xodim kabinetingizni ochadi."
    >
      <BackToBotButton />
    </Notice>
  );
}
