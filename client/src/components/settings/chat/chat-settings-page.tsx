"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { SettingsPageHeader } from "../settings-page-header";
import { ChatSettingsTab } from "./chat-settings-tab";
import { ChatReportsTab } from "./chat-reports-tab";
import { ChatBannedTab } from "./chat-banned-tab";

const TITLE = msg("Chat");
const DESCRIPTION = msg("Chatni yoqish, shikoyatlar va chatdan chiqarilganlar");
const DEFAULT_TAB = "sozlamalar";
const TABS = [
  { value: DEFAULT_TAB, label: msg("Sozlamalar") },
  { value: "shikoyatlar", label: msg("Shikoyatlar") },
  { value: "chiqarilganlar", label: msg("Chatdan chiqarilganlar") },
];

/** CEO-only (the settings entry is `ceoOnly`); a tab's body mounts, and fetches, only while it is active. */
export function ChatSettingsPage() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const activeTab = TABS.some((x) => x.value === urlTab) ? (urlTab as string) : DEFAULT_TAB;

  const onTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div>
      <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          {TABS.map((x) => (
            <TabsTrigger key={x.value} value={x.value}>
              {t(x.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sozlamalar">{activeTab === "sozlamalar" && <ChatSettingsTab />}</TabsContent>
        <TabsContent value="shikoyatlar">{activeTab === "shikoyatlar" && <ChatReportsTab />}</TabsContent>
        <TabsContent value="chiqarilganlar">{activeTab === "chiqarilganlar" && <ChatBannedTab />}</TabsContent>
      </Tabs>
    </div>
  );
}
