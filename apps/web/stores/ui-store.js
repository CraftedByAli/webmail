import { create } from 'zustand';

/** Transient UI state that does not belong in the URL or on the server. */
export const useUiStore = create((set, get) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

  /** Selected row ids in the current list. */
  selected: new Set(),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  selectMany: (ids) => set({ selected: new Set(ids) }),
  clearSelection: () => set({ selected: new Set() }),

  /** Keyboard focus index in the list (j/k navigation). */
  focusedIndex: -1,
  setFocusedIndex: (i) => set({ focusedIndex: i }),

  realtimeStatus: 'connecting', // connecting | live | polling | offline
  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),
}));
