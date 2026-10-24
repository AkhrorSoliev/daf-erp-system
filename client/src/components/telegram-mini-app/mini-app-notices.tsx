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
import { useT } from "@/i18n/context";
import {
  closeMiniApp,
  type MiniAppAudience,
} from "@/lib/telegram-mini-app";
import { cn } from "@/lib/utils";

/**
 * Which look the leaves of this file take. The student cabinet is Lumio
 * (ADR-0040); the staff cabinet (ADR-0045) opens in the shell of the staff
 * sign-in pages and takes the cabinet's own look. What `/tg` says and does is
 * the same in both — the states and their texts exist once, and only
 * `Loading`, `Notice`, `Action` and `Steps` read this.
 */
export const StaffSkin = createContext(false);

/** The sign-in request is on its way. */
export function Loading({ children }: { children: ReactNode }) {
  if (useContext(StaffSkin)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
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
  /** Something failed. The staff look colours and announces it, as its
      sign-in form does with an error; Lumio draws every notice alike. */
  alert?: boolean;
  children: ReactNode;
}) {
  if (useContext(StaffSkin)) {
    // No icon: the page heading above already says where you are.
    return (
      <div className="flex flex-col gap-5">
        <div role={alert ? "alert" : undefined}>
          <h2
            className={cn("text-lg font-semibold", alert && "text-destructive")}
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
  if (useContext(StaffSkin)) {
    const { variant, iconBefore, iconAfter, className, onClick, children } =
      props;
    if (variant === "ghost") {
      // A quiet action is a link-like line, like «Parolni unutdingizmi?» on
      // the sign-in form.
      return (
        <button
          type="button"
          onClick={onClick}
          className="w-full py-1 text-center text-sm text-primary hover:underline"
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
        // The height of «Kirish» on the sign-in form.
        className={cn("h-11 w-full", className)}
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
  if (useContext(StaffSkin)) {
    return (
      <div className="rounded-md border bg-card p-4 text-sm">
        <p>{children}</p>
        <p className="mt-2 text-muted-foreground">{otherwise}</p>
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
  const t = useT();
  return (
    <Action
      variant="ghost"
      iconBefore={<X weight="bold" />}
      onClick={closeMiniApp}
    >
      {t("Yopish")}
    </Action>
  );
}

function BackToBotButton() {
  const t = useT();
  return (
    <Action iconBefore={<TelegramLogo weight="fill" />} onClick={closeMiniApp}>
      {t("Botga qaytish")}
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
  const t = useT();
  if (audience === "staff") {
    return (
      <Notice
        icon={<WarningCircle weight="bold" />}
        title={t("Telegram akkauntingiz xodim hisobiga bog'lanmagan")}
        description={t("Bu Telegram akkaunt hech bir DaF xodimining hisobiga bog'lanmagan.")}
      >
        {/* Bog'lash — botdagi /xodim (ADR-0045): o'z raqami hisobdagi
            telefonga teng bo'lsa, Telegram shu hisobga bog'lanadi. */}
        <Steps
          otherwise={t(
            "Tizimdagi raqamingiz Telegram raqamingizdan boshqa bo'lsa, administrator bilan bog'laning.",
          )}
        >
          {t(
            "Botga qayting va {command} buyrug'ini yuboring, so'ng {button} orqali raqamingizni yuboring. Telegram'ingiz xodim hisobingizga bog'lanadi — kabinetni qayta oching.",
            { command: "/xodim", button: "«📱 Telefon raqamni yuborish»" },
          )}
        </Steps>
        <BackToBotButton />
      </Notice>
    );
  }

  return (
    <Notice
      icon={<WarningCircle weight="bold" />}
      title={t("Telegram akkauntingiz ro'yxatdan o'tmagan")}
      description={t("Bu Telegram akkaunt hech bir DaF o'quvchisiga bog'lanmagan.")}
    >
      {/* The /start button links without touching anything else (a password
          reset would replace the password too). */}
      <Steps
        otherwise={t("Raqamingiz tizimda topilmasa, administrator bilan bog'laning.")}
      >
        {t(
          "DaF o'quvchisi bo'lsangiz: botga qayting, {start} yuboring va {link} tugmasini bosing, so'ng {button} orqali raqamingizni yuboring. Akkauntingiz bog'lanadi — so'ng kabinetni qayta oching.",
          {
            start: "/start",
            link: "«📱 Hisobimni bog'lash»",
            button: "«📱 Telefon raqamni yuborish»",
          },
        )}
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
  const t = useT();
  return (
    <Notice
      icon={<User weight="bold" />}
      title={t("Siz xodim sifatida ro'yxatdan o'tgansiz")}
      description={t(
        "Bu — o'quvchilar kabineti. Xodim kabinetingiz tugmasini chatga yubordik: botga qayting va {button} tugmasini bosing.",
        { button: "«💼 Kabinet»" },
      )}
    >
      <BackToBotButton />
    </Notice>
  );
}
