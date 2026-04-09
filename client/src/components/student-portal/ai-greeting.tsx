"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sun, Sunrise, Sunset, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TimeSlot {
  icon: LucideIcon;
  greetings: string[];
}

const TIME_SLOTS: Record<string, TimeSlot> = {
  morning: {
    icon: Sunrise,
    greetings: [
      "Guten Morgen, {name}! Bereit für einen neuen Lerntag?",
      "Guten Morgen! Lass uns heute etwas Großartiges lernen!",
      "Frühaufsteher! Die besten Ideen kommen am Morgen, {name}.",
      "Guten Morgen, {name}! Ein neuer Tag, eine neue Chance zu lernen.",
      "Moin, {name}! Frisch und motiviert — so fängt ein guter Tag an!",
      "Guten Morgen! Kaffee ist fertig, jetzt fehlt nur noch Deutsch, {name}!",
      "Guten Morgen, {name}! Jeder Tag ist eine neue Gelegenheit.",
      "Hallo, {name}! Der frühe Vogel fängt den Wurm — und du fängst Deutsch!",
    ],
  },
  afternoon: {
    icon: Sun,
    greetings: [
      "Guten Tag, {name}! Wie läuft dein Tag?",
      "Hallo, {name}! Bereit für die nächste Lektion?",
      "Weiter so, {name}! Du machst das großartig!",
      "Guten Tag! Perfekte Zeit zum Deutschlernen, {name}.",
      "Hallo, {name}! Lass uns gemeinsam weiterlernen!",
      "Guten Nachmittag, {name}! Dein Deutsch wird jeden Tag besser!",
      "Hey, {name}! Kleine Schritte führen zu großen Erfolgen.",
      "Guten Tag, {name}! Übung macht den Meister!",
    ],
  },
  evening: {
    icon: Sunset,
    greetings: [
      "Guten Abend, {name}! Noch ein bisschen lernen?",
      "Schön, dass du noch da bist, {name}! Lernen kennt keine Uhrzeit.",
      "Feierabend? Perfekte Zeit zum Üben, {name}!",
      "Guten Abend! Der Abend gehört dir und deinem Deutsch, {name}.",
      "Hallo, {name}! Abends lernt es sich besonders gut.",
      "Guten Abend, {name}! Noch eine Runde Deutsch vor dem Schlafengehen?",
      "Hey, {name}! Wer abends lernt, vergisst nichts!",
      "Guten Abend! Du bist wirklich fleißig, {name}!",
    ],
  },
  night: {
    icon: Moon,
    greetings: [
      "Nachtschicht, {name}? Respekt!",
      "Noch wach, {name}? Die Nacht ist jung — und du bist fleißig!",
      "Schlaf ist wichtig... aber Deutsch lernen auch, {name}!",
      "Wow, {name}! Sogar nachts am Lernen — das nenne ich Motivation!",
      "Hey, {name}! Die Sterne schauen zu, wie du Deutsch lernst.",
      "Gute Nacht? Nein, gute Lernzeit, {name}!",
      "Nachts sind alle Katzen grau — aber dein Deutsch wird bunt, {name}!",
      "Hallo, {name}! Nachts lernt man am besten — sagt zumindest jeder Nachtmensch.",
    ],
  },
};

function getTimeSlotKey(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

export function AiGreeting() {
  const user = useAuth((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [randomIndex, setRandomIndex] = useState(0);

  const slotKey = getTimeSlotKey();
  const slot = TIME_SLOTS[slotKey];
  const Icon = slot.icon;

  useEffect(() => {
    setRandomIndex(Math.floor(Math.random() * slot.greetings.length));
    setMounted(true);
  }, [slot.greetings.length]);

  const name = user?.firstName ?? "Freund";
  const greeting = slot.greetings[randomIndex].replace("{name}", name);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6 md:p-10">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/5 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 size-32 rounded-full bg-primary/5 blur-2xl" />

      <div
        className={`relative flex flex-col items-center text-center gap-4 transition-opacity duration-700 ${mounted ? "opacity-100" : "opacity-0"}`}
      >
        <div className="flex items-center justify-center size-12 rounded-full bg-primary/10">
          <Icon className="size-6 text-primary" />
        </div>

        <h1 className="text-xl md:text-2xl font-bold leading-relaxed tracking-tight max-w-lg">
          {greeting}
        </h1>

        <p className="text-sm text-muted-foreground">
          Dein KI-Assistent für Deutsch
        </p>
      </div>
    </div>
  );
}
