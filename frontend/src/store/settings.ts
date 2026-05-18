import { create } from 'zustand';
import { api, AppSettings } from '@/api/client';
import { applyTheme, applyLocale, applyInstanceName } from '@/utils/theme';

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  patch: (p: Partial<AppSettings> | Record<string, unknown>) => Promise<void>;
}

function applyAll(s: AppSettings | null) {
  if (!s?.ui) return;
  applyTheme(s.ui.theme);
  applyLocale(s.ui.locale);
  applyInstanceName(s.ui.instance_name);
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const r = await api.get<AppSettings>('/settings');
      set({ settings: r.data });
      applyAll(r.data);
    } finally { set({ loading: false }); }
  },
  patch: async (p) => {
    const r = await api.put<AppSettings>('/settings', p);
    set({ settings: r.data });
    applyAll(r.data);
  },
}));
