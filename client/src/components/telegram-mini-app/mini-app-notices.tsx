"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Card,
  type LumioButtonProps,
} from "@/components/student-portal/lumio";
import {
  CircleNotch,
  TelegramLogo,
  User,
  WarningCircle,
  X,
} from "@/components/student-portal/lumio/icon";
import { Button as SheetButton } from "@/components/ui/button";
import {
  closeMiniApp,
  type MiniAppAudience,
} from "@/lib/telegram-mini-app";
import { cn } from "@/lib/utils";

/**
 * Which look the leaves of this file take. The student cabinet is Lumio
 * (ADR-0040); the staff cabinet (ADR-0045) is written on the Daftar sheet of
 * the staff sign-in pages. What `/tg` says and does is the same in both — the
 * states and their texts exist once, and only `Loading`, `Notice`, `Action`
 * and `Steps` read this.
 *
 * The sheet is written in whole 2rem rows (see `DaftarSheet`): its branches
 * below put text on `daftar-row` and size everything else in rows.
 */
export const DaftarSkin = createContext(false);

/** The sign-in request is on its way. */
export function Loading({ children }: { children: ReactNode }) {
  if (useContext(DaftarSkin)) {
    return (
      <p className="daftar-row flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {children}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-ink-500">
      <CircleNotch className="size-8 animate-spin" weight="bold" />
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}

/** Mini App kirishining bir holati: belgi, sarlavha, izoh va tugmalar. */
export function Notice({
  icon,
  title,
  description,
  alert = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Something failed. The sheet writes it the way its sign-in form writes an
      error — in red pen; Lumio draws every notice alike. */
  alert?: boolean;
  children: ReactNode;
}) {
  if (useContext(DaftarSkin)) {
    // No icon: the sheet is handwriting on paper, as on the sign-in pages.
    return (
      <div className="flex flex-col">
        <div role={alert ? "alert" : undefined}>
          <h2
            className={cn(
              "daftar-row",
              alert ? "daftar-hand text-lg text-destructive" : "font-semibold",
            )}
          >
            {title}
          </h2>
          <p className="daftar-row text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </div>
    );
  }
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

type ActionProps = Pick<
  LumioButtonProps,
  "variant" | "iconBefore" | "iconAfter" | "className" | "onClick" | "children"
>;

/** A full-width button of a notice. */
export function Action(props: ActionProps) {
  if (useContext(DaftarSkin)) {
    const { variant, iconBefore, iconAfter, className, onClick, children } =
      props;
    if (variant === "ghost") {
      // A quiet action is a line of the sheet, like «Parolni unutdingizmi?»
      // on the sign-in form.
      return (
        <button
          type="button"
          onClick={onClick}
          className="daftar-row w-full text-center text-sm text-primary hover:underline"
        >
          {children}
        </button>
      );
    }
    return (
      <SheetButton
        type="button"
        size="lg"
        variant={variant === "secondary" ? "outline" : "default"}
        // One empty row, then the button centred in two — as «Kirish».
        className={cn("mt-10 mb-2 h-12 w-full", className)}
        onClick={onClick}
      >
        {iconBefore}
        {children}
        {iconAfter}
      </SheetButton>
    );
  }
  return <Button block {...props} />;
}

/** How to link the Telegram account, and whom to ask when that cannot work. */
function Steps({
  otherwise,
  children,
}: {
  otherwise: string;
  children: ReactNode;
}) {
  if (useContext(DaftarSkin)) {
    return (
      <div className="mt-8">
        <p className="daftar-row text-sm">{children}</p>
        <p className="daftar-row text-sm text-muted-foreground">{otherwise}</p>
      </div>
    );
  }
  return (
    <Card
      pad="md"
      className="space-y-2 text-left text-sm font-semibold text-ink-700"
    >
      <p>{children}</p>
      <p className="text-ink-500">{otherwise}</p>
    </Card>
  );
}

export function CloseButton() {
  return (
    <Action
      variant="ghost"
      iconBefore={<X weight="bold" />}
      onClick={closeMiniApp}
    >
      Yopish
    </Action>
  );
}

function BackToBotButton() {
  return (
    <Action iconBefore={<TelegramLogo weight="fill" />} onClick={closeMiniApp}>
      Botga qaytish
    </Action>
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
        <Steps otherwise="Tizimdagi raqamingiz Telegram raqamingizdan boshqa bo'lsa, administrator bilan bog'laning.">
          Botga qayting va /xodim buyrug'ini yuboring, so'ng «📱 Telefon
          raqamni yuborish» orqali raqamingizni yuboring. Telegram'ingiz
          xodim hisobingizga bog'lanadi — kabinetni qayta oching.
        </Steps>
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
      <Steps otherwise="Raqamingiz tizimda topilmasa, administrator bilan bog'laning.">
        DaF o'quvchisi bo'lsangiz: botga qayting, «💳 To'lovlar» tugmasini
        bosing va «📱 Telefon raqamni yuborish» orqali raqamingizni
        yuboring. Akkauntingiz bog'lanadi — so'ng kabinetni qayta oching.
      </Steps>
      <BackToBotButton />
    </Notice>
  );
}

/**
 * O'quvchi kabinetini xodim ochdi (eski xabardagi tugma). Uning kabineti
 * boshqa portalda va bu yerdan unga o'tib bo'lmaydi (boshqa domenda Telegram
 * ko'prigi uziladi) — server shu paytda chatga «💼 Kabinet» tugmasini yubordi.
 */
export function StaffAccountNotice() {
  return (
    <Notice
      icon={<User weight="bold" />}
      title="Siz xodim sifatida ro'yxatdan o'tgansiz"
      description="Bu — o'quvchilar kabineti. Xodim kabinetingiz tugmasini chatga yubordik: botga qayting va «💼 Kabinet» tugmasini bosing."
    >
      <BackToBotButton />
    </Notice>
  );
}
