import { create } from "zustand";
import { Appearance } from "react-native";
import { AiProfile, AppSettings, Course, ExperienceRow } from "../types";
import { colors, ThemeColors } from "../theme";
import { loadSettings, saveSettings } from "../services/settings";
import { listCourses } from "../services/courses";
import { listProfiles } from "../services/providers";
import { getDb } from "../db/database";

interface AppState {
  ready: boolean;
  settings: AppSettings;
  theme: ThemeColors;
  isDark: boolean;
  courses: Course[];
  profiles: AiProfile[];
  activeCourseId: string | null;
  activeConversationId: string | null;
  activeExperience: ExperienceRow | null;
  streaming: boolean;
  menuOpen: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setSettings: (s: AppSettings) => Promise<void>;
  setActiveCourse: (id: string | null) => void;
  setActiveConversation: (id: string | null) => void;
  setActiveExperience: (e: ExperienceRow | null) => void;
  setStreaming: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
}

function resolveTheme(mode: AppSettings["theme"]): { isDark: boolean; theme: ThemeColors } {
  const sys = Appearance.getColorScheme() === "dark";
  const isDark = mode === "system" ? sys : mode === "dark";
  return { isDark, theme: isDark ? colors.dark : colors.light };
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: {
    theme: "dark",
    fontScale: 1,
    horsCoursEnabled: true,
    prompts: {},
    defaultProviderId: "",
    documentsProviderId: "",
    schemasProviderId: "",
  },
  theme: colors.dark,
  isDark: true,
  courses: [],
  profiles: [],
  activeCourseId: null,
  activeConversationId: null,
  activeExperience: null,
  streaming: false,
  menuOpen: false,
  init: async () => {
    try {
      await getDb();
      const settings = await loadSettings();
      const { isDark, theme } = resolveTheme(settings.theme);
      const [courses, profiles] = await Promise.all([listCourses(), listProfiles()]);
      set({ ready: true, settings, isDark, theme, courses, profiles });
    } catch (e) {
      console.warn("init failed", e);
      const { isDark, theme } = resolveTheme("dark");
      set({ ready: true, isDark, theme });
    }
  },
  refresh: async () => {
    try {
      const [courses, profiles] = await Promise.all([listCourses(), listProfiles()]);
      set({ courses, profiles });
    } catch (e) {
      console.warn("refresh failed", e);
    }
  },
  setSettings: async (s) => {
    try {
      await saveSettings(s);
    } catch (e) {
      console.warn("saveSettings failed", e);
    }
    const { isDark, theme } = resolveTheme(s.theme);
    set({ settings: s, isDark, theme });
  },
  setActiveCourse: (id) => set({ activeCourseId: id }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setActiveExperience: (e) => set({ activeExperience: e }),
  setStreaming: (v) => set({ streaming: v }),
  setMenuOpen: (v) => set({ menuOpen: v }),
}));
