"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

export interface SplitPanelState {
  header: string;
  content: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/**
 * A tiny external store for the AppLayout split panel. Pages publish their panel here; only the
 * shell subscribes, so publishing never re-renders the page (no effect/render loops).
 */
class SplitPanelStore {
  private state: SplitPanelState | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  set(state: SplitPanelState | null) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

const SplitPanelContext = createContext<SplitPanelStore | null>(null);

export function SplitPanelProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new SplitPanelStore());
  return <SplitPanelContext.Provider value={store}>{children}</SplitPanelContext.Provider>;
}

/** Read by the shell. */
export function useSplitPanelState(): SplitPanelState | null {
  const store = useContext(SplitPanelContext);
  if (!store) throw new Error("useSplitPanelState must be used inside SplitPanelProvider");
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}

/** Called by a page to show (or, with null, hide) the split panel. Cleared on unmount. */
export function useSplitPanel(panel: SplitPanelState | null): void {
  const store = useContext(SplitPanelContext);
  useEffect(() => {
    store?.set(panel);
  });
  useEffect(() => () => store?.set(null), [store]);
}
