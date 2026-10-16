import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultSettings, type Settings } from './types';

type WorkspaceState = {
  alphaId: string | null;
  expression: string;
  settings: Settings;
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  activeRunId: string | null;
  activeResultTab: 'Summary' | 'PnL' | 'Yearly' | 'Checks' | 'Log';
  source: 'manual' | 'ai';
  setAlpha: (alphaId: string, expression: string, settings?: Settings) => void;
  setExpression: (expression: string) => void;
  setSettings: (settings: Settings) => void;
  setSaveState: (state: WorkspaceState['saveState']) => void;
  setActiveRun: (id: string | null) => void;
  setResultTab: (tab: WorkspaceState['activeResultTab']) => void;
  markAiSource: () => void;
  consumeSource: () => 'manual' | 'ai';
};
export const useWorkspace = create<WorkspaceState>((set, get) => ({
  alphaId: null, expression: '', settings: defaultSettings, saveState: 'saved', activeRunId: null,
  activeResultTab: 'Summary', source: 'manual',
  setAlpha: (alphaId, expression, settings) => set({ alphaId, expression, settings: settings ?? defaultSettings, saveState: 'saved', activeRunId: null, source: 'manual' }),
  setExpression: (expression) => set({ expression, saveState: 'dirty' }),
  setSettings: (settings) => set({ settings, saveState: 'dirty' }),
  setSaveState: (saveState) => set({ saveState }),
  setActiveRun: (activeRunId) => set({ activeRunId }),
  setResultTab: (activeResultTab) => set({ activeResultTab }),
  markAiSource: () => set({ source: 'ai' }),
  consumeSource: () => { const source = get().source; set({ source: 'manual' }); return source; },
}));

type OpenAlphaTab = { id: string; name: string };
type LayoutState = { aiOpen: boolean; libraryOpen: boolean; aiTab: 'Chat' | 'Suggestions'; openAlphaTabs: OpenAlphaTab[]; openTab: (tab: OpenAlphaTab) => void; closeTab: (id: string) => void; toggleAi: () => void; toggleLibrary: () => void; setAiTab: (tab: 'Chat' | 'Suggestions') => void };
export const useLayout = create<LayoutState>()(persist((set) => ({
  aiOpen: true, libraryOpen: true, aiTab: 'Suggestions', openAlphaTabs: [],
  openTab: (tab) => set((state) => ({ openAlphaTabs: state.openAlphaTabs.some((item) => item.id === tab.id) ? state.openAlphaTabs.map((item) => item.id === tab.id ? tab : item) : [...state.openAlphaTabs, tab] })),
  closeTab: (id) => set((state) => ({ openAlphaTabs: state.openAlphaTabs.filter((tab) => tab.id !== id) })),
  toggleAi: () => set((state) => ({ aiOpen: !state.aiOpen })),
  toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),
  setAiTab: (aiTab) => set({ aiTab }),
}), { name: 'alphasim-layout', partialize: ({ aiOpen, libraryOpen, aiTab, openAlphaTabs }) => ({ aiOpen, libraryOpen, aiTab, openAlphaTabs }) }));
