"use client";

import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  MessageSquare,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { AiGreeting } from "./ai-greeting";

const aiFeatures: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Testlar",
    description: "Bilimingizni sinab ko'ring va natijalarni kuzating",
    icon: ClipboardCheck,
  },
  {
    title: "AI Chat",
    description:
      "AI yordamchisi bilan suhbatlashing va savollaringizga javob oling",
    icon: MessageSquare,
  },
  {
    title: "So'z boyitish",
    description: "Yangi so'zlarni o'rganing va lug'atingizni kengaytiring",
    icon: BookOpen,
  },
];

export function StudentAiSection() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Greeting */}
      <AiGreeting />

      {/* Feature cards */}
      <div className="space-y-3">
        {aiFeatures.map((feature) => (
          <div key={feature.title} className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <feature.icon className="size-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">{feature.title}</p>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    Tez orada
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
