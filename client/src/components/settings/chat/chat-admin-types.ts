/** `GET/PATCH /chat/admin/settings` (CEO only). */
export interface ChatAdminSettings {
  enabled: boolean;
  weekMinutesActive: number;
  weekMinutesRadio: number;
}

export type ChatAdminSettingsPatch = Partial<ChatAdminSettings>;
